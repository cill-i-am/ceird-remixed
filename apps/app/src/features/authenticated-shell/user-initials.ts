export function userInitials(name: string, email: string) {
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  const initials = nameParts
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase() ?? "")
    .join("");

  if (initials !== "") {
    return initials;
  }

  return email.at(0)?.toUpperCase() ?? "?";
}
