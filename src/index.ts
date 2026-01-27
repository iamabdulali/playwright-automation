import { brightWheelLogin } from "./brightwheel/login.ts";
import dotenv from 'dotenv';
import { parentSquareLogin } from "./parentsquare/login.ts";
dotenv.config();



brightWheelLogin()
parentSquareLogin()