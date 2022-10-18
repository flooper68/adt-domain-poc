import { AwsRegion, InfrastructureProvider } from "./common";

export class AppCreated {
  readonly type = "AppCreated";
  constructor(
    readonly payload: {
      readonly uuid: string;
    }
  ) {}
}

export class ExistingInfrastructureSelected {
  readonly type = "ExistingInfrastructureSelected";
  constructor(
    readonly payload: { readonly uuid: string } & (
      | {
          infrastructureProvider: InfrastructureProvider.AWS;
        }
      | {
          infrastructureProvider: InfrastructureProvider.AZURE;
        }
    )
  ) {}
}

export class BuildRequested {
  readonly type = "BuildRequested";
  constructor(
    readonly payload: { readonly uuid: string } & (
      | {
          infrastructureProvider: InfrastructureProvider.AWS;
          region: AwsRegion;
        }
      | {
          infrastructureProvider: InfrastructureProvider.AZURE;
        }
    )
  ) {}
}

export class AppActivated {
  readonly type = "AppActivated";
  constructor(readonly payload: { readonly uuid: string }) {}
}

export class AppDeleted {
  readonly type = "AppDeleted";
  constructor(readonly payload: { readonly uuid: string }) {}
}

export type AppDomainEvent =
  | AppCreated
  | AppActivated
  | ExistingInfrastructureSelected
  | AppDeleted
  | BuildRequested;
