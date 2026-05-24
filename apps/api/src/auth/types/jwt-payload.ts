export type OctoJwtPayload = {
  sub: string;
  tenant_id: string;
  roles: string[];
  scopes: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
};

export type OctoServicePayload = {
  sub: string;
  roles: string[];
  scopes: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
};

export type OctoRequestUser = OctoJwtPayload | OctoServicePayload;
