import { brightWheelLogin } from "./src/brightwheel/login";
import dotenv from 'dotenv';
import { parentSquareLogin } from "./src/parentsquare/login";
dotenv.config();



brightWheelLogin()
parentSquareLogin()