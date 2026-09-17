import { Router } from "express";
import * as authModule from "../modules/auth-module";
import { refreshTokenFn, verifyAccess } from "../modules/jwt-module";

export const router = Router();

/*Authenticate user data*/
router.post("/login", async function (req, res) {
  authModule.logInUser(req, res);
});
//Log out user by removing tokens from cookies and redis
router.post("/logout", async function (req, res) {
  authModule.logOutUser(req, res);
});
/* Sigh up new user. */
router.post("/", async function (req, res) {
  authModule.signUpNewUser(req, res);
});
/* Tocken refresh. */
router.get("/refresh", refreshTokenFn);

router.get("/userData", verifyAccess, async function (req, res) {
  authModule.getUserData(req, res);
});
/* Update user data. */
router.post("/update", async function (req, res) {
  authModule.updateUserData(req, res);
});

//PASSWORD RESET
//Setting token for password reset
router.post("/set_password_token", async function (req, res) {
  authModule.setResetPasswordToken(req, res);
});
//Greating new password
router.post("/set_new_password", async function (req, res) {
  authModule.setNewPassword(req, res);
});
//EMAIL
/*Confirm user email*/
router.post("/email/confirm", async function (req, res) {
  authModule.confirmEmailAddress(req, res);
});

//VALIDATORS
/* GET check if userId is unique. */
router.get("/checkId", async function (req, res) {
  authModule.checkUserIdUnique(req, res);
});

/* GET check if email is unique. */
router.get("/checkEmail", async function (req, res) {
  authModule.checkEmailUnique(req, res);
});
