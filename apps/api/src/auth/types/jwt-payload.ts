export type OctoJwtPayload = {
  sub: string;
  tenant_id: string;
  agency_ids?: string[];
  workspace_ids?: string[];
  role?: string;
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
