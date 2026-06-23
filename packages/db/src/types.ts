declare const userIdBrand: unique symbol;

export type UserId = string & {
  readonly [userIdBrand]: "UserId";
};

export type AuthUserView = {
  readonly id: UserId;
  readonly email: string;
  readonly name: string;
  readonly image: string | null;
};
