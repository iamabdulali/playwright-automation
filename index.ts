import { brightWheelLogin } from "./src/brightwheel/login.js";
import dotenv from 'dotenv';
import { parentSquareLogin } from "./src/parentsquare/login.js";
dotenv.config();



brightWheelLogin()
parentSquareLogin()