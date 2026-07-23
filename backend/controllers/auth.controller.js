const  User  = require("../models/users");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/response");
const { STATUS_CODE } = require("../utils/constants");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const authServices = require("../services/auth.service");
const jwtSecret = process.env.JWT_SECRET || "your_jwt_secret";
async function Login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return sendErrorResponse(
        res,
        {},
        "Invalid Credentials",
        STATUS_CODE.NOT_FOUND
      );
    }
    const validatePassword = await bcrypt.compare(password, user.password);

    if (!validatePassword) {
      sendErrorResponse(
        res,
        {},
        "Invalid Credentials",
        STATUS_CODE.UNAUTHORIZED
      );
    } else {

      const token=jwt.sign(
        { id: user.id, email: user.email },
        jwtSecret,
        { expiresIn: "24h" }
      );



      return sendSuccessResponse(
        res,
        {token,email},
        "Logged In Sucessfully",
        STATUS_CODE.SUCCESS
      );
    }
  } catch (err) {
    return sendErrorResponse(
      res,
      {},
      "Internal Server Error",
      STATUS_CODE.UNAUTHORIZED
    );
  }
}

async function Signup(req, res) {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({email});


    if (existingUser) {
      return sendErrorResponse(
        res,
        {},
        "User Already Exists",
        STATUS_CODE.CONFLICT
      );
    }

    const createUser = await authServices.createNewUser({
      name,
      email,
      password,
    });

    if (createUser) {
      const token=jwt.sign(
        { id: createUser.id, email: createUser.email },
        jwtSecret,
        { expiresIn: "24h" }
      );



      return sendSuccessResponse(
        res,
        {token,email},
        "Logged In Sucessfully",
        STATUS_CODE.SUCCESS
      );
    }
  } catch (err) {
    return sendErrorResponse(
      res,
      {},
      `Error Creating User: ${err.message}`,
      STATUS_CODE.INTERNAL_SERVER_ERROR
    );
  }
}



module.exports = {
  Login,
  Signup
};
