---
name: app-forms
description: Use when building, reviewing, or refactoring forms in this TanStack Start app, especially forms using TanStack Form, shadcn/Base UI Field components, Effect Schema client-side validation, clientside mutations, Better Auth forms, or form state/reactivity without useState/useEffect.
---

# App Forms

Use this skill for forms in `apps/*`, especially `apps/app`. It captures the repository decision that forms use TanStack Form with shadcn/Base UI primitives and Effect Schema.

## Required Context

Before implementing or reviewing a form:

1. Read `apps/AGENTS.md`.
2. Read the shadcn skill when changing UI primitives or form markup.
3. Read `references/tanstack-form-effect-schema.md` for the implementation pattern.

## Defaults

- Use `@tanstack/react-form` for form state and field reactivity.
- Use Effect Schema for client-side validation and submit-time decoding.
- Use `Schema.toStandardSchemaV1(schema)` for TanStack Form validators in this repo's Effect version.
- Submit by calling clientside mutations or client libraries; do not post form data or use native server actions.
- Keep form values and derived form state out of `useState`.
- Use `form.Subscribe`, `useStore(form.store, selector)`, or TanStack Form listeners for reactive UI and field-change behavior.
- Use shadcn `FieldGroup`, `Field`, `FieldLabel`, and `FieldError`; put `data-invalid` on `Field` and `aria-invalid` on the control.
- Keep submit behavior route-local until reuse is real. Share schemas, parsers, and boundary adapters through feature slices; avoid broad reusable form components that hide page behavior.

## Avoid

- React Hook Form, Formik, or another form library without a new recorded decision.
- `useEffect` to mirror form values, derive validity, or react to normal field changes.
- `useState` for submitted values, dirty state, pending state, or error state already owned by TanStack Form or a mutation client.
- Treating Standard Schema validation as enough when the submitted value needs branded or transformed Effect Schema output.
- Duplicating schema definitions for form validation and mutation inputs when they are the same logical shape.
