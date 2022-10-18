import { AppActivated, AppDeleted, AppDomainEvent, ExistingInfrastructureSelected } from "./events";
import { AppStatus, DbState, InfrastructureProvider } from "./common";

interface DomainEntity<E> {
  readonly dispatchedEvents: E[];
}

enum InfrastructureStatus {
  NotSelected,
  Selected
}

interface NotSelectedInfrastructure {
  readonly status: InfrastructureStatus.NotSelected;
}

interface SelectedInfrastructure {
  readonly status: InfrastructureStatus.Selected;
  readonly type: InfrastructureProvider;
}

interface New extends DomainEntity<AppDomainEvent> {
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: NotSelectedInfrastructure;
  selectInfrastructure(type: InfrastructureProvider): NotActivated;
  delete(): Deleted;
}

interface NotActivated extends DomainEntity<AppDomainEvent> {
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: SelectedInfrastructure;
  activate(): Active;
  delete(): Deleted;
}

interface Active extends DomainEntity<AppDomainEvent> {
  readonly uuid: string;
  readonly status: AppStatus.Active;
  readonly infrastructure: SelectedInfrastructure;
  delete(): Deleted;
}

interface Deleted extends DomainEntity<AppDomainEvent> {
  uuid: string;
  status: AppStatus.Deleted;
  infrastructure: SelectedInfrastructure | NotSelectedInfrastructure;
}

interface Corrupted extends DomainEntity<AppDomainEvent> {
  uuid: string;
  status: AppStatus.Corrupted;
}

export type App = New | NotActivated | Active | Deleted | Corrupted;

function buildNew(state: {
  dispatchedEvents: AppDomainEvent[];
  uuid: string;
  status: AppStatus.New;
  infrastructure: {
    status: InfrastructureStatus.NotSelected
  }
}): New {
  return {
    ...state,
    selectInfrastructure(type: InfrastructureProvider): NotActivated {
      return buildNotActivated({
        ...state,
        dispatchedEvents: [
          new ExistingInfrastructureSelected({
            uuid: state.uuid,
            infrastructureProvider: type
          })
        ],
        infrastructure: { status: InfrastructureStatus.Selected, type }
      });
    },
    delete(): Deleted {
      return buildDeleted({
        ...state,
        dispatchedEvents: [new AppDeleted({ uuid: state.uuid })],
        status: AppStatus.Deleted
      });
    }
  };
}


function buildNotActivated(state: {
  readonly dispatchedEvents: AppDomainEvent[];
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: SelectedInfrastructure;
}): NotActivated {
  return {
    ...state,
    activate(): Active {
      return buildActive({
        ...state,
        dispatchedEvents: [new AppActivated({ uuid: state.uuid })],
        status: AppStatus.Active
      });
    },
    delete(): Deleted {
      return buildDeleted({
        ...state,
        dispatchedEvents: [new AppDeleted({ uuid: state.uuid })],
        status: AppStatus.Deleted
      });
    }
  };
}

function buildActive(state: {
  readonly dispatchedEvents: AppDomainEvent[];
  readonly uuid: string;
  readonly status: AppStatus.Active;
  readonly infrastructure: SelectedInfrastructure;
}): Active {
  return {
    ...state,
    delete() {
      return buildDeleted({
        ...state,
        dispatchedEvents: [new AppDeleted({ uuid: state.uuid })],
        status: AppStatus.Deleted
      });
    }
  };
}

function buildDeleted(state: {
  readonly dispatchedEvents: AppDomainEvent[];
  readonly uuid: string;
  readonly status: AppStatus.Deleted;
  readonly infrastructure: SelectedInfrastructure | NotSelectedInfrastructure;
}): Deleted {
  return {
    ...state
  };
}

function isNew(app: App): app is New {
  return (
    app.status === AppStatus.New &&
    app.infrastructure.status === InfrastructureStatus.NotSelected
  );
}

function mapDbState(dbState: DbState): App {
  if(dbState.status === AppStatus.New && dbState.infrastructureStatus === InfrastructureStatus.NotSelected) {
    return buildNew({
      dispatchedEvents: [],
      uuid: dbState.uuid,
      status: dbState.status,
      infrastructure: { status: dbState.infrastructureStatus }
    })
  }

  if(dbState.status === AppStatus.New && dbState.infrastructureStatus === InfrastructureStatus.Selected && dbState.infrastructureProvider) {
    return buildNotActivated({
      dispatchedEvents: [],
      uuid: dbState.uuid,
      status: dbState.status,
      infrastructure: { status: dbState.infrastructureStatus, type: dbState.infrastructureProvider }
    })
  }

  if(dbState.status === AppStatus.Active && dbState.infrastructureStatus === InfrastructureStatus.Selected && dbState.infrastructureProvider) {
    return buildActive({
      dispatchedEvents: [],
      uuid: dbState.uuid,
      status: dbState.status,
      infrastructure: { status: dbState.infrastructureStatus, type: dbState.infrastructureProvider }
    })
  }

  if(dbState.status === AppStatus.Deleted ) {
    if(dbState.infrastructureStatus === InfrastructureStatus.Selected && dbState.infrastructureProvider) {
      return buildDeleted({
        dispatchedEvents: [],
        uuid: dbState.uuid,
        status: dbState.status,
        infrastructure: { status: dbState.infrastructureStatus, type: dbState.infrastructureProvider }
      })
    } else if(dbState.infrastructureStatus === InfrastructureStatus.NotSelected) {
      return buildDeleted({
        dispatchedEvents: [],
        uuid: dbState.uuid,
        status: dbState.status,
        infrastructure: { status: dbState.infrastructureStatus}
      })
    }
  }

  return {
    dispatchedEvents: [],
    uuid: dbState.uuid,
    status: AppStatus.Corrupted,
  }
}

function getDbApp(): DbState {
  throw new Error("Not implemented");
}

function withAppContext(app: App, callback: (app: App) => App): void {
  const result = callback(app);

  // Reduces events to DB
  // save(result.dispatchedEvents);
}

function test() {
  const app = getDbApp()

  withAppContext(mapDbState(app), (app) => {
    if (!isNew(app)) {
      throw new Error();
    }

   // We can not possibly make this fail here because everything is immutable
   // and the type narrowing holds

   const notActivated = app.selectInfrastructure(InfrastructureProvider.AWS);

   const active = notActivated.activate();

   const deleted = active.delete()


   // Only returned things take effect, so it is more approchable and no magic is happening
   return deleted;

   // Or chain it like this
   // return app
   //   .selectInfrastructure(InfrastructureProvider.AWS)
   //   .activate()
   //   .delete();
  })

}