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

interface NewState {
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: NotSelectedInfrastructure;
}

type New  = NewState &  DomainEntity<AppDomainEvent> &{
  selectInfrastructure(type: InfrastructureProvider): NotActivated;
  delete(): Deleted;
}

interface NotActivatedState {
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: SelectedInfrastructure;
}

type NotActivated = NotActivatedState & DomainEntity<AppDomainEvent> & {
  activate(): Active;
  delete(): Deleted;
}

interface ActiveState {
  readonly uuid: string;
  readonly status: AppStatus.Active;
  readonly infrastructure: SelectedInfrastructure;
}

type Active = ActiveState & DomainEntity<AppDomainEvent>  &{
  readonly uuid: string;
  readonly status: AppStatus.Active;
  readonly infrastructure: SelectedInfrastructure;
  delete(): Deleted;
}

interface DeletedState  {
  uuid: string;
  status: AppStatus.Deleted;
  infrastructure: SelectedInfrastructure | NotSelectedInfrastructure;
}

type Deleted = DeletedState & DomainEntity<AppDomainEvent>

interface CorruptedState {
  uuid: string;
  status: AppStatus.Corrupted;
  // Here we could add reason and add potential recovery actions that could be triggered by the user
}

type Corrupted = CorruptedState &  DomainEntity<AppDomainEvent>

export type AppState = NewState | NotActivatedState | ActiveState | DeletedState | CorruptedState;
export type App = New | NotActivated | Active | Deleted | Corrupted;

function isNew(app: App): app is New {
  return (
    app.status === AppStatus.New &&
    app.infrastructure.status === InfrastructureStatus.NotSelected
  );
}

function isNewState(app: AppState): app is NewState {
  return (
    app.status === AppStatus.New &&
    app.infrastructure.status === InfrastructureStatus.NotSelected
  );
}

function isNotActivatedState(app: AppState): app is NotActivatedState {
  return (
    app.status === AppStatus.New &&
    app.infrastructure.status === InfrastructureStatus.Selected
  );
}

function isActiveState(app: AppState): app is ActiveState {
  return (
    app.status === AppStatus.Active
  );
}

function applyExistingInfrastructureSelected(state: NewState, event: ExistingInfrastructureSelected): NotActivatedState {
  return {
    ...state,
    infrastructure: { status: InfrastructureStatus.Selected, type: event.payload.infrastructureProvider }
  }
}

function applyAppDeleted(state: NewState | NotActivatedState | ActiveState, event: AppDeleted): DeletedState {
  return {
    ...state,
    status: AppStatus.Deleted
  }
}

function applyAppActivated(state: NotActivatedState, event: AppActivated): ActiveState {
  return {
    ...state,
    status: AppStatus.Active
  }
}

function checkInvariants(state: AppState) {
  throw new Error(`Not implemented`);
}

// This can be used for reducing events in true eventsourcing way
function apply(state: AppState, event: AppDomainEvent): AppState {
  switch (event.type) {
    case "ExistingInfrastructureSelected":
      if(isNewState(state)){
        return applyExistingInfrastructureSelected(state, event);
      } return {
        ...state,
        status: AppStatus.Corrupted
      }
    case "AppDeleted":
      if(isNotActivatedState(state) || isNewState(state) || isActiveState(state)){
        return applyAppDeleted(state, event);
      } return {
        ...state,
        status: AppStatus.Corrupted
      }
    case "AppActivated":
      if(isNotActivatedState(state)){
        return applyAppActivated(state, event);
      } return {
        ...state,
        status: AppStatus.Corrupted
      }
    default:
      return state;
  }
}

function buildNew(state: NewState & DomainEntity<AppDomainEvent>): New {
  return {
    ...state,
    selectInfrastructure(type: InfrastructureProvider): NotActivated {
      const event = new ExistingInfrastructureSelected({
        uuid: state.uuid,
        infrastructureProvider: type
      })
      const newState = applyExistingInfrastructureSelected(state, event)
      checkInvariants(newState)
      return buildNotActivated({
        ...newState,
        dispatchedEvents: [event]
      });
    },
    delete(): Deleted {
      const event = new AppDeleted({ uuid: state.uuid });
      const newState = applyAppDeleted(state, event);
      checkInvariants(newState)
      return buildDeleted({
        ...newState,
        dispatchedEvents: [event],
      });
    }
  };
}


function buildNotActivated(state: NotActivatedState & DomainEntity<AppDomainEvent>): NotActivated {
  return {
    ...state,
    activate(): Active {
      const event = new AppActivated({ uuid: state.uuid });
      const newState = applyAppActivated(state, event);
      checkInvariants(newState)
      return buildActive({
        ...newState,
        dispatchedEvents: [event],
      });
    },
    delete(): Deleted {
      const event = new AppDeleted({ uuid: state.uuid });
      const newState = applyAppDeleted(state, event);
      checkInvariants(newState)
      return buildDeleted({
        ...newState,
        dispatchedEvents: [event],
      });
    }
  };
}

function buildActive(state: ActiveState & DomainEntity<AppDomainEvent>): Active {
  return {
    ...state,
    delete() {
      const event = new AppDeleted({ uuid: state.uuid });
      const newState = applyAppDeleted(state, event);
      checkInvariants(newState)
      return buildDeleted({
        ...newState,
        dispatchedEvents: [event],
      });
    }
  };
}

function buildDeleted(state: DeletedState & DomainEntity<AppDomainEvent>): Deleted {
  return {
    ...state
  };
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