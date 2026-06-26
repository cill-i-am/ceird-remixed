import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@ceird/ui";
import { getAuthClient } from "../../auth-client";
import { betterAuthErrorMessage } from "../../features/auth/shared/better-auth-error";
import { toFieldErrors } from "../../features/auth/shared/form-errors";
import {
  parseSignUpForm,
  signUpFormValidator,
  type SignUpFormValues,
} from "../../features/auth/shared/form-schemas";
import { parseAuthBaseUrl } from "../../public-config-schema";

export const Route = createFileRoute("/_auth/sign-up")({
  component: SignUpPage,
});

const authRoute = getRouteApi("/_auth");

function SignUpPage() {
  const { authBaseUrl: encodedAuthBaseUrl } = authRoute.useRouteContext();
  const authBaseUrl = parseAuthBaseUrl(encodedAuthBaseUrl);
  const signUpMutation = useMutation({
    mutationFn: async (values: SignUpFormValues) => {
      const response = await getAuthClient(authBaseUrl).signUp.email({
        email: values.email,
        name: values.name,
        password: values.password,
      });

      if (response.error !== null) {
        throw new Error(
          betterAuthErrorMessage(response.error, "Sign up failed."),
        );
      }

      return response.data;
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: signUpFormValidator,
      onSubmit: signUpFormValidator,
    },
    listeners: {
      onChange: () => {
        if (signUpMutation.error !== null) {
          signUpMutation.reset();
        }
      },
    },
    onSubmit: async ({ value }) => {
      const values = parseSignUpForm(value);

      try {
        await signUpMutation.mutateAsync(values);
      } catch {
        return;
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Create your Ceird account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Fill in the form below to create your account.
          </p>
        </div>

        <form.Field
          name="name"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="sign-up-name">Full name</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="name"
                  id="sign-up-name"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Ada Lovelace"
                  type="text"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError
                    errors={toFieldErrors(field.state.meta.errors)}
                  />
                ) : null}
              </Field>
            );
          }}
        />

        <form.Field
          name="email"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="email"
                  id="sign-up-email"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="m@example.com"
                  type="email"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError
                    errors={toFieldErrors(field.state.meta.errors)}
                  />
                ) : null}
              </Field>
            );
          }}
        />

        <form.Field
          name="password"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="sign-up-password">Password</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id="sign-up-password"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError
                    errors={toFieldErrors(field.state.meta.errors)}
                  />
                ) : null}
                <FieldDescription>
                  Must be at least 8 characters long.
                </FieldDescription>
              </Field>
            );
          }}
        />

        <form.Field
          name="confirmPassword"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="sign-up-confirm-password">
                  Confirm password
                </FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id="sign-up-confirm-password"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError
                    errors={toFieldErrors(field.state.meta.errors)}
                  />
                ) : null}
              </Field>
            );
          }}
        />

        {signUpMutation.error === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>Sign up failed</AlertTitle>
            <AlertDescription>{signUpMutation.error.message}</AlertDescription>
          </Alert>
        )}

        {signUpMutation.isSuccess ? (
          <Alert>
            <AlertTitle>Account created.</AlertTitle>
          </Alert>
        ) : null}

        <Field>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
            children={({ canSubmit, isSubmitting }) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Creating account..." : "Create account"}
              </Button>
            )}
          />
        </Field>

        <Field>
          <FieldDescription className="text-center">
            Already have an account?{" "}
            <Link className="underline underline-offset-4" to="/sign-in">
              Sign in
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
