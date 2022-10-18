import {
  AppActivated,
  AppDeleted,
  AppDomainEvent,
  ExistingInfrastructureSelected
} from "./events";
import { AppStatus, DbState, InfrastructureProvider, InfrastructureStatus } from "./common";



interface NotSelectedInfrastructureState {
  readonly status: InfrastructureStatus.NotSelected;
}

interface NotSelectedInfrastructure {
  selectInfrastructure(type: InfrastructureProvider): void;
}

interface SelectedInfrastructureState {
  readonly status: InfrastructureStatus.Selected;
  readonly type: InfrastructureProvider;
}

interface CorruptedState {
  readonly uuid: string;
  readonly status: AppStatus.Corrupted;
}

interface NewState {
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: NotSelectedInfrastructureState;
}

interface NewInterface {
  delete(): void;
  readonly infrastructure: NotSelectedInfrastructure;
}

interface NotActivatedState {
  readonly uuid: string;
  readonly status: AppStatus.New;
  readonly infrastructure: SelectedInfrastructureState;
}

interface NotActivatedInterface {
  activate(): void;
  delete(): void;
}

interface ActiveState {
  readonly uuid: string;
  readonly status: AppStatus.Active;
  readonly infrastructure: SelectedInfrastructureState;
}

interface ActiveInterface {
  delete(): void;
}

interface DeletedState {
  uuid: string;
  status: AppStatus.Deleted;
  infrastructure: SelectedInfrastructureState | NotSelectedInfrastructureState;
}

type DeletedInterface = void;

type State =
  | CorruptedState
  | NewState
  | NotActivatedState
  | ActiveState
  | DeletedState;

type Interface = {
  isNew(): NewInterface;
  isNotActivated(): NotActivatedInterface;
  isActive(): ActiveInterface;
  isNotDeleted():
    | NewInterface
    | NotActivatedInterface
    | ActiveInterface;
  isDeleted(): DeletedInterface;
};

type Dispatch = (event: AppDomainEvent) => void;

function isNewState(app: State): app is NewState {
  return (
    app.status === AppStatus.New &&
    app.infrastructure.status === InfrastructureStatus.NotSelected
  );
}

function buildNewInterface(
  state: NewState,
  dispatch: Dispatch
): NewInterface {
  return {
    delete() {
      dispatch(new AppDeleted({ uuid: state.uuid }));
    },
    infrastructure: {
      selectInfrastructure(type: InfrastructureProvider): void {
        dispatch(
          new ExistingInfrastructureSelected({
            uuid: state.uuid,
            infrastructureProvider: type
          })
        );
      }
    }
  };
}

function isNotActivatedState(app: State): app is NotActivatedState {
  return (
    app.status === AppStatus.New &&
    app.infrastructure.status === InfrastructureStatus.Selected
  );
}

function buildNotActivatedInterface(
  state: NotActivatedState,
  dispatch: Dispatch
): NotActivatedInterface {
  return {
    delete() {
      dispatch(new AppDeleted({ uuid: state.uuid }));
    },
    activate() {
      dispatch(new AppActivated({ uuid: state.uuid }));
    }
  };
}

function isActiveState(app: State): app is ActiveState {
  return (
    app.status === AppStatus.Active &&
    app.infrastructure.status === InfrastructureStatus.Selected
  );
}

function buildActiveInterface(
  state: ActiveState,
  dispatch: Dispatch
): ActiveInterface {
  return {
    delete() {
      dispatch(new AppDeleted({ uuid: state.uuid }));
    }
  };
}

function isDeletedState(app: State): app is DeletedState {
  return app.status === AppStatus.Deleted;
}

function buildInterface(state: State, dispatch: Dispatch): Interface {
  return {
    isNew() {
      if (!isNewState(state)) {
        throw new Error();
      }
      return buildNewInterface(state, dispatch);
    },
    isNotActivated() {
      if (!isNotActivatedState(state)) {
        throw new Error();
      }
      return buildNotActivatedInterface(state, dispatch);
    },
    isActive() {
      if (!isActiveState(state)) {
        throw new Error();
      }
      return buildActiveInterface(state, dispatch);
    },
    // Notice this one - it is weird and we need it, as delete is on more states...
    isNotDeleted() {
      if (isNewState(state)) {
        return buildNewInterface(state, dispatch);
      } else if (isNotActivatedState(state)) {
        return buildNotActivatedInterface(state, dispatch);
      } else if (isActiveState(state)) {
        return buildActiveInterface(state, dispatch);
      }
      throw new Error();
    },
    isDeleted() {
      return;
    }
  };
}

function mapNewState(props: DbState): State {
  if (
    props.status === AppStatus.New &&
    props.infrastructureStatus === InfrastructureStatus.NotSelected
  ) {
    return {
      uuid: props.uuid,
      status: props.status,
      infrastructure: {
        status: props.infrastructureStatus
      }
    };
  }

  if (
    props.status === AppStatus.New &&
    props.infrastructureStatus === InfrastructureStatus.Selected &&
    !!props.infrastructureProvider
  ) {
    return {
      uuid: props.uuid,
      status: props.status,
      infrastructure: {
        status: props.infrastructureStatus,
        type: props.infrastructureProvider
      }
    };
  }

  if (
    props.status === AppStatus.Active &&
    props.infrastructureStatus === InfrastructureStatus.Selected &&
    !!props.infrastructureProvider
  ) {
    return {
      uuid: props.uuid,
      status: props.status,
      infrastructure: {
        status: props.infrastructureStatus,
        type: props.infrastructureProvider
      }
    };
  }

  if (props.status === AppStatus.Deleted) {
    if (
      props.infrastructureProvider &&
      props.infrastructureStatus === InfrastructureStatus.Selected
    ) {
      return {
        uuid: props.uuid,
        status: props.status,
        infrastructure: {
          status: props.infrastructureStatus,
          type: props.infrastructureProvider
        }
      };
    } else if (
      props.infrastructureStatus === InfrastructureStatus.NotSelected
    ) {
      return {
        uuid: props.uuid,
        status: props.status,
        infrastructure: {
          status: props.infrastructureStatus
        }
      };
    }
  }

  return {
    uuid: props.uuid,
    status: AppStatus.Corrupted
  };
}

function reduce(state: State, event: AppDomainEvent): State {
  switch (event.type) {
    case "AppCreated":
      return {
        uuid: event.payload.uuid,
        status: AppStatus.New,
        infrastructure: {
          status: InfrastructureStatus.NotSelected
        }
      };
    case "ExistingInfrastructureSelected":
      if (isNewState(state)) {
        return {
          ...state,
          infrastructure: {
            status: InfrastructureStatus.Selected,
            type: event.payload.infrastructureProvider
          }
        };
      } else {
        return {
          ...state,
          status: AppStatus.Corrupted
        };
      }
    case "AppActivated":
      if (isNotActivatedState(state)) {
        return {
          ...state,
          status: AppStatus.Active
        };
      } else {
        return {
          ...state,
          status: AppStatus.Corrupted
        };
      }

    case "AppDeleted":
      if (isDeletedState(state)) {
        return {
          ...state,
          status: AppStatus.Deleted
        };
      } else {
        return {
          ...state,
          status: AppStatus.Corrupted
        };
      }
    default: {
      return state;
    }
  }
}

export class Root {
  private _state: State;

  constructor(props: DbState) {
    this._state = mapNewState(props);
  }

  private dispatch(event: AppDomainEvent): void {
    this._state = reduce(this._state, event);
    // Here would dispatch to the context of the command, which is not obvious and
    // can be magical for juniors
  }

  selectInfrastructure(type: InfrastructureProvider): void {
    const appInterface = buildInterface(this._state, this.dispatch);

    appInterface.isNew().infrastructure.selectInfrastructure(type);

    // We could do this and it would corrupt the state in runtime

    // const newApp = appInterface.isNew();
    // newApp.delete();
    // newApp.infrastructure.selectInfrastructure(type);
  }
  activate(): void {
    const appInterface = buildInterface(this._state, this.dispatch);

    appInterface.isNotActivated().activate();
  }
  delete(): void {
    const appInterface = buildInterface(this._state, this.dispatch);
    appInterface.isNotDeleted().delete();
  }
}

export function test(dbState: DbState) {
  const root = new Root(dbState);

  root.selectInfrastructure(InfrastructureProvider.AWS);
  root.activate();
  root.delete();

  // We have no type safety here, as we can call any method on root
  // Eg. this would fail in runtime, not type check
  //  root.delete();
  //  root.activate();
  //  root.selectInfrastructure(InfrastructureProvider.AWS);
}


// This is longer, more complicated and less typesafe...