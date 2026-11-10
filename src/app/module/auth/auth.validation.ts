import { email, z } from "zod";

const PatientRegistrationZodSchema = z.object({
	name: z
		.string("Not a String!")
		.min(3, "Name must be atleast 3 characters!")
		.max(20, "Name must be under 20 characters"),
	email: z.email("Not Email!"),
	password: z
		.string()
		.min(8, "Password minimum 8 characters")
		.max(16, "Password maximum 16 characters")
		.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
		.regex(/[a-z]/, "Password must contain at least one lowercase letter")
		.regex(/[0-9]/, "Password must contain at least one number")
		.regex(
			/[^A-Za-z0-9]/,
			"Password must contain at least one special character",
		),
	patient: z
		.object({
			contactNumber: z.string().optional(),
		})
		.optional(),
});

const LoginZodSchema = z.object({
	email: z.email(),
	password: z
		.string()
		.min(8, "Password minimum 8 characters")
		.max(16, "Password maximum 16 characters")
		.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
		.regex(/[a-z]/, "Password must contain at least one lowercase letter")
		.regex(/[0-9]/, "Password must contain at least one number")
		.regex(
			/[^A-Za-z0-9]/,
			"Password must contain at least one special character",
		),
});

const ForgotPasswordZodSchema = z.object({
	email: z.email(),
});

const ResetPasswordZodSchema = z.object({
	email: z.email(),
	newPassword: z
		.string()
		.min(8, "Password minimum 8 characters")
		.max(16, "Password maximum 16 characters")
		.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
		.regex(/[a-z]/, "Password must contain at least one lowercase letter")
		.regex(/[0-9]/, "Password must contain at least one number")
		.regex(
			/[^A-Za-z0-9]/,
			"Password must contain at least one special character",
		),
	otp: z.string().length(6),
});

export const userValidation = {
	PatientRegistrationZodSchema,
	LoginZodSchema,
	ForgotPasswordZodSchema,
	ResetPasswordZodSchema,
};
