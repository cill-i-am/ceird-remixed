import * as Schema from "effect/Schema";

const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailAddressSchema = Schema.Trim.check(
  Schema.isPattern(emailAddressPattern, {
    message: "Enter a valid email address.",
  }),
).pipe(Schema.brand("EmailAddress"));

const AuthNameSchema = Schema.Trim.check(
  Schema.isMinLength(1, {
    message: "Enter your name.",
  }),
).pipe(Schema.brand("AuthName"));

const AuthPasswordSchema = Schema.String.check(
  Schema.isMinLength(8, {
    message: "Password must be at least 8 characters.",
  }),
).pipe(Schema.brand("AuthPassword"));

export const SignInFormSchema = Schema.Struct({
  email: EmailAddressSchema,
  password: AuthPasswordSchema,
});

export type SignInFormValues = Schema.Schema.Type<typeof SignInFormSchema>;

export const parseSignInForm = Schema.decodeUnknownSync(SignInFormSchema);
export const signInFormValidator = Schema.toStandardSchemaV1(SignInFormSchema);

export const SignUpFormSchema = Schema.Struct({
  name: AuthNameSchema,
  email: EmailAddressSchema,
  password: AuthPasswordSchema,
  confirmPassword: AuthPasswordSchema,
}).check(
  Schema.makeFilter((value) =>
    value.password === value.confirmPassword
      ? undefined
      : {
          path: ["confirmPassword"],
          issue: "Passwords must match.",
        },
  ),
);

export type SignUpFormValues = Schema.Schema.Type<typeof SignUpFormSchema>;

export const parseSignUpForm = Schema.decodeUnknownSync(SignUpFormSchema);
export const signUpFormValidator = Schema.toStandardSchemaV1(SignUpFormSchema);
