import * as Schema from "effect/Schema";

const FormFieldErrorSchema = Schema.Struct({
  message: Schema.optionalKey(Schema.String),
});

type FormFieldError = Schema.Schema.Type<typeof FormFieldErrorSchema>;

const parseFormFieldError = Schema.decodeUnknownSync(FormFieldErrorSchema);

export function toFieldErrors(
  errors: ReadonlyArray<unknown>,
): Array<FormFieldError> {
  return errors
    .map(toFieldError)
    .filter((error) => error !== undefined);
}

function toFieldError(error: unknown): FormFieldError | undefined {
  if (typeof error === "string") {
    return { message: error };
  }

  try {
    const parsed = parseFormFieldError(error);
    return parsed.message === undefined ? undefined : parsed;
  } catch {
    return undefined;
  }
}
