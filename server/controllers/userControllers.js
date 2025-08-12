import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import razorpay from 'razorpay';
import transactionModel from "../models/transactionModel.js";

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing Details" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userData = {
      name: name,
      email: email,
      password: hashedPassword,
    };
    const newUser = new userModel(userData);
    const user = await newUser.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token: token, user: { name: user.name } });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ success: true, token: token, user: { name: user.name } });
    } else {
      return res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const userCredits = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await userModel.findById(userId);
    res.json({
      success: true,
      credits: user.creditBalance,
      user: {
        name: user.name,
      },
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
}

const razorpayInstance= new razorpay({
     key_id: process.env.RAZORPAY_KEY_ID,
     key_secret: process.env.RAZORPAY_KEY_SECRET,

})

const paymentRazorPay = async (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.json({ success: false, message: "Missing Details" });
    }

    const userData = await userModel.findById(userId);
    if (!userData) {
      return res.json({ success: false, message: "User not found" });
    }

    let credits, plan, amount;

    switch (planId) {
      case "Basic":
        plan = "Basic";
        credits = 100;
        amount = 10;
        break;
      case "Advanced":
        plan = "Advanced";
        credits = 500;
        amount = 50;
        break;
      case "Business":
        plan = "Business";
        credits = 5000;
        amount = 250;
        break;
      default:
        return res.json({ success: false, message: "Plan not found" });
    }

    const date = Date.now();

    const transactionData = {
      userId,
      plan,
      amount,
      credits,
      date,
    };

    const newTransaction = await transactionModel.create(transactionData);

    const options = {
      amount: amount * 100, // convert to paise
      currency: process.env.CURRENCY || "INR",
      receipt: `${newTransaction._id}`,
    };

    // No await here; use callback
    razorpayInstance.orders.create(options, (error, order) => {
      if (error) {
        console.log(error);
        return res.json({ success: false, message: error });
      }
      res.json({ success: true, order });
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};


const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id } = req.body;

    // Fetch payment details
    const payment = await razorpayInstance.payments.fetch(razorpay_payment_id);

    if (payment.status !== "captured") {
      return res.json({ success: false, message: "Payment not captured" });
    }

    // Fetch order details using razorpay_order_id
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);

    // orderInfo.receipt is the transaction _id string you saved earlier
    const transactionId = orderInfo.receipt;

    // Find transaction by receipt (which is transaction's _id)
    const transactionData = await transactionModel.findById(transactionId);

    if (!transactionData) {
      return res.json({ success: false, message: "Transaction not found" });
    }

    if (transactionData.payment) {
      return res.json({ success: false, message: "Payment already processed" });
    }

    // Find user
    const user = await userModel.findById(transactionData.userId);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // Update user credits
    const updatedCredits = user.creditBalance + transactionData.credits;

    await userModel.findByIdAndUpdate(user._id, { creditBalance: updatedCredits });

    // Mark transaction as paid
    await transactionModel.findByIdAndUpdate(transactionData._id, { payment: true });

    return res.json({ success: true, message: "Credits added successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};




export { registerUser, loginUser, userCredits, paymentRazorPay, verifyRazorpay};
