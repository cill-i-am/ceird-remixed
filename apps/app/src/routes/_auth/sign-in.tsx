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
  parseSignInForm,
  signInFormValidator,
  type SignInFormValues,
} from "../../features/auth/shared/form-schemas";
import { parseAuthBaseUrl } from "../../public-config-schema";

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInPage,
});

const authRoute = getRouteApi("/_auth");

function SignInPage() {
  const { authBaseUrl: encodedAuthBaseUrl } = authRoute.useRouteContext();
  const authBaseUrl = parseAuthBaseUrl(encodedAuthBaseUrl);
  const signInMutation = useMutation({
    mutationFn: async (values: SignInFormValues) => {
      const response = await getAuthClient(authBaseUrl).signIn.email({
        email: values.email,
        password: values.password,
      });

      if (response.error !== null) {
        throw new Error(
          betterAuthErrorMessage(response.error, "Sign in failed."),
        );
      }

      return response.data;
    },
  });

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onChange: signInFormValidator,
      onSubmit: signInFormValidator,
    },
    listeners: {
      onChange: () => {
        if (signInMutation.error !== null) {
          signInMutation.reset();
        }
      },
    },
    onSubmit: async ({ value }) => {
      const values = parseSignInForm(value);

      try {
        await signInMutation.mutateAsync(values);
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
          <h1 className="text-2xl font-bold">Sign in to Ceird</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email below to sign in to your account.
          </p>
        </div>

        <form.Field
          name="email"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="email"
                  id="sign-in-email"
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
                <div className="flex items-center">
                  <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
                </div>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="current-password"
                  id="sign-in-password"
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

        {signInMutation.error === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>Sign in failed</AlertTitle>
            <AlertDescription>{signInMutation.error.message}</AlertDescription>
          </Alert>
        )}

        {signInMutation.isSuccess ? (
          <Alert>
            <AlertTitle>Signed in.</AlertTitle>
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
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            )}
          />
        </Field>

        <Field>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{" "}
            <Link className="underline underline-offset-4" to="/sign-up">
              Sign up
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
