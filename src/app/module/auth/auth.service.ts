import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
} from "./auth.interface";
import { TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import { ne } from "zod/v4/locales/index.js";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs, { name } from "ejs"
import path from "path";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;
	if (!patientData) {
		throw new Error("Patient data is required");
	}
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new Error("User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	const createdUser = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: false,
			patient: {
				create: { name, email, contactNumber: patientData.contactNumber },
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new Error("User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User is deleted");
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);

	if (!isPasswordMatched) {
		throw new Error("Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new Error("User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});

		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID Token Verification Failed", error);
		throw new Error("Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload) {
		throw new Error("Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload.email) {
		throw new Error("Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw new Error("Google Email User Name Not Found");
	}

	const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
		where: {
			email: googleIdTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleIdTokenPayload.sub,
		},
	});

	let user = ifPatientExistWithGoogleAuth;

	if (!ifPatientExistWithGoogleAuth) {
		const ifPatientExistWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleIdTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIAL,
			},
		});

		if (ifPatientExistWithCredentials) {
			if (!ifPatientExistWithCredentials.emailVerified) {
				throw new Error("Email Not Verified");
			}

			if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
				throw new Error("User Is Blocked");
			}

			if (
				ifPatientExistWithCredentials.isDeleted ||
				ifPatientExistWithCredentials.status === UserStatus.DELETED
			) {
				throw new Error("User Is Deleted");
			}

			user = await prisma.user.update({
				where: {
					id: ifPatientExistWithCredentials.id,
				},

				data: {
					googleId: googleIdTokenPayload.sub,
				},
			});
		} else {
			// Google Register
			user = await prisma.user.create({
				data: {
					name: googleIdTokenPayload.name,
					email: googleIdTokenPayload.email,
					role: Role.PATIENT,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
					patient: {
						create: {
							name: googleIdTokenPayload.name,
							email: googleIdTokenPayload.email,
						},
					},
				},
			});
		}
	}

	if (!user) {
		throw new Error("User Not Found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User Is Blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User Is Deleted");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const forgotPassword = async (paload: IForgotPasswordPayload) => {
	const { email } = paload;

	const isUserExists = await prisma.user.findUnique({
		where: {
			email: email,
		},
	});

	if (!isUserExists) {
		throw new Error("User Not Exist");
	}

	if (isUserExists.status === "BLOCKED") {
		throw new Error("User is Blocked!");
	}

	if (!isUserExists.emailVerified) {
		throw new Error("User Not Verified");
	}

	if (isUserExists.isDeleted || isUserExists.status === "DELETED") {
		throw new Error("User is Deleted!");
	}

	if (isUserExists.googleId && isUserExists.authProvider === "GOOGLE") {
		throw new Error("User is registered with Google. Please use Google Login.");
	}

	//* creating otp and sending it ot Redis
	const otp = crypto.randomInt(100000, 1000000).toString();

	const key = `forgot-password-otp:${isUserExists.email}`;

	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: 5 * 60,
		},
	});

	const templatePath = path.join(process.cwd(), "src/app/templates/forgot-password.ejs")

	const templateData = {
		name: isUserExists.name,
		otp,
		expirationMinutes : 5
	}

	const html = await ejs.renderFile(templatePath, templateData)

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExists.email,
		subject: "Forgot Password OTP - PH Health Care",
		// text: `Your Forgot Password OTP is ${otp}`
		html

	})

	

};

const resetPassword = async (paload: IResetPasswordPayload) => {
	const { email, otp, newPassword } = paload;

	const isUserExists = await prisma.user.findUnique({
		where: {
			email: email,
		},
	});

	if (!isUserExists) {
		throw new Error("User Not Exist");
	}

	if (isUserExists.status === "BLOCKED") {
		throw new Error("User is Blocked!");
	}

	if (!isUserExists.emailVerified) {
		throw new Error("User Not Verified");
	}

	if (isUserExists.isDeleted || isUserExists.status === "DELETED") {
		throw new Error("User is Deleted!");
	}

	if (isUserExists.googleId && isUserExists.authProvider === "GOOGLE") {
		throw new Error("User is registered with Google. Please use Google Login.");
	}

	//* Getting OTP from redis
	const key = `forgot-password-otp:${isUserExists.email}`;

	const redisOTP = await redisClient.get(key);

	if (!redisOTP) {
		throw new Error("Invalid OTP");
	}

	if (redisOTP !== otp) {
		throw new Error("OTP Does Not Match!");
	}

	//* Creating New Hashed Password and updating it
	const hashedNewPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: {
			email: isUserExists.email,
		},
		data: {
			password: hashedNewPassword,
		},
	});

	//* Deleting the otp after password change
	await redisClient.del([key]);


	const templatePath = path.join(process.cwd(), "src/app/templates/reset-password-success.ejs")

	const templateData = {name: isUserExists.name}

	const html = await ejs.renderFile(templatePath, templateData);
	
	//* Sending mail after password reset
		await transporter.sendMail({
		from: config.email_sender,
		to: isUserExists.email,
		subject: "Password Changed - PH Health Care",
		// text: `Your Password changed successfully`
		html

	})

};

export const AuthService = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};
