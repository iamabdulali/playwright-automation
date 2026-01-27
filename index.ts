import { brightWheelLogin } from "./src/brightwheel/login.ts";
import dotenv from 'dotenv';
import { parentSquareLogin } from "./src/parentsquare/login.ts";
dotenv.config();



brightWheelLogin()
parentSquareLogin()