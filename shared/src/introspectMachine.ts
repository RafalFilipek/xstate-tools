import * as XState from "xstate";
import { pathToStateValue } from "xstate/lib/utils";
import {
  getMatchesStates,
  getTransitionsFromNode,
} from "./getTransitionsFromNode";

export interface SubState {
  targets: string[];
  sources: string[];
  states: Record<string, SubState>;
}

const makeSubStateFromNode = (
  node: XState.StateNode,
  rootNode: XState.StateNode,
  nodeMap: {
    [id: string]: {
      sources: Set<string>;
      children: Set<string>;
    };
  },
): SubState => {
  const nodeFromMap = nodeMap[node.id];

  const stateNode = rootNode.getStateNodeById(node.id);

  const targets = getTransitionsFromNode(stateNode);
  return {
    sources: Array.from(nodeFromMap.sources).filter(Boolean),
    targets: targets.filter(Boolean),
    states: Array.from(nodeFromMap.children).reduce((obj, child) => {
      const childNode = rootNode.getStateNodeById(child);
      return {
        ...obj,
        [childNode.key]: makeSubStateFromNode(childNode, rootNode, nodeMap),
      };
    }, {}),
  };
};

class ItemMap {
  /**
   * The internal map that we use to keep track
   * of all of the items
   */
  private map: {
    [name: string]: { events: Set<string>; states: Set<XState.StateValue> };
  };

  /**
   * Check if one of these items is optional -
   * passed in from above via a prop
   */
  private checkIfOptional: (name: string) => boolean;

  constructor(props: { checkIfOptional: (name: string) => boolean }) {
    this.checkIfOptional = props.checkIfOptional;
    this.map = {};
  }

  /**
   * Add an item to the cache, along with the path of the node
   * it occurs on
   */
  addItem(itemName: string, nodePath: string[]) {
    if (!this.map[itemName]) {
      this.map[itemName] = {
        events: new Set(),
        states: new Set(),
      };
    }
    this.map[itemName].states.add(pathToStateValue(nodePath));
  }

  /**
   * Add a triggering event to an item in the cache, for
   * instance the event type which triggers a guard/action/service
   */
  addEventToItem(itemName: string, eventType: string, nodePath: string[]) {
    this.addItem(itemName, nodePath);
    this.map[itemName].events.add(eventType);
  }

  /**
   * Transform the data into the shape required for index.d.ts
   */
  toDataShape() {
    let isRequiredInTotal = false;
    const lines = Object.entries(this.map)
      .filter(([name]) => {
        return !/\./.test(name);
      })
      .map(([name, data]) => {
        const optional = this.checkIfOptional(name);
        if (!optional) {
          isRequiredInTotal = true;
        }
        return {
          name,
          required: !optional,
          events: Array.from(data.events),
          states: Array.from(data.states)
            .map((state) => JSON.stringify(state))
            .filter(Boolean),
        };
      });
    return {
      lines,
      required: isRequiredInTotal,
    };
  }
}

const xstateRegex = /^xstate\./;

export type IntrospectMachineResult = ReturnType<typeof introspectMachine>;

export const introspectMachine = (machine: XState.StateNode) => {
  const guards = new ItemMap({
    checkIfOptional: (name) => Boolean(machine.options.guards[name]),
  });
  const actions = new ItemMap({
    checkIfOptional: (name) => Boolean(machine.options.actions[name]),
  });
  const services = new ItemMap({
    checkIfOptional: (name) => Boolean(machine.options.services[name]),
  });
  const activities = new ItemMap({
    checkIfOptional: (name) => Boolean(machine.options.activities[name]),
  });
  const delays = new ItemMap({
    checkIfOptional: (name) => Boolean(machine.options.delays[name]),
  });

  const nodeMap: {
    [id: string]: {
      sources: Set<string>;
      children: Set<string>;
    };
  } = {};

  const allStateNodes = machine.stateIds.map((id) =>
    machine.getStateNodeById(id),
  );

  allStateNodes?.forEach((node) => {
    nodeMap[node.id] = {
      sources: new Set(),
      children: new Set(),
    };
  });

  allStateNodes?.forEach((node) => {
    // If this node is an initial state of a parent
    if (
      node.parent?.initialStateNodes.find(
        (initialNode) => initialNode.id === node.id,
      ) ||
      // Or it's the root state
      !node.parent
    ) {
      // Add xstate.init to all invoked services
      node.invoke.forEach((service) => {
        if (typeof service.src === "string") {
          services.addEventToItem(service.src, "xstate.init", node.path);
        }
      });

      node.onEntry.forEach((action) => {
        if (action.type) {
          actions.addEventToItem(action.type, "xstate.init", node.path);
        }
      });

      node.after.forEach(({ delay }) => {
        if (typeof delay === "string") {
          delays.addEventToItem(delay, "xstate.init", node.path);
        }
      });
    }

    Object.values(node.states)?.forEach((childNode) => {
      nodeMap[node.id].children.add(childNode.id);
    });

    // TODO - make activities pick up the events
    // that led to them
    node.activities?.forEach((activity) => {
      if (activity.type && activity.type !== "xstate.invoke") {
        activities.addItem(activity.type, node.path);
      }
    });

    node.after?.forEach(({ delay }) => {
      if (typeof delay === "string") {
        delays.addItem(delay, node.path);
      }
    });

    node.invoke?.forEach((service) => {
      if (typeof service.src !== "string") return;
      services.addItem(service.src, node.path);
    });

    node.transitions?.forEach((transition) => {
      (transition.target as unknown as XState.StateNode[])?.forEach(
        (targetNode) => {
          nodeMap[targetNode.id].sources.add(transition.eventType);
        },
      );
      if (transition.cond && transition.cond.name) {
        if (transition.cond.name !== "cond") {
          guards.addEventToItem(
            transition.cond.name,
            transition.eventType,
            node.path,
          );
        }
      }

      (transition.target as unknown as XState.StateNode[])?.forEach(
        (targetNode) => {
          /** Pick up invokes */
          targetNode.invoke?.forEach((service) => {
            if (typeof service.src !== "string") return;
            services.addEventToItem(
              service.src,
              transition.eventType,
              node.path,
            );
          });
        },
      );

      if (transition.actions) {
        transition.actions?.forEach((action) => {
          if (!xstateRegex.test(action.type)) {
            actions.addEventToItem(
              action.type,
              transition.eventType,
              node.path,
            );
          }
          if (action.type === "xstate.choose" && Array.isArray(action.conds)) {
            action.conds.forEach(({ cond, actions: condActions }) => {
              if (typeof cond === "string") {
                guards.addEventToItem(cond, transition.eventType, node.path);
              }
              if (Array.isArray(condActions)) {
                condActions.forEach((condAction) => {
                  if (typeof condAction === "string") {
                    actions.addEventToItem(
                      condAction,
                      transition.eventType,
                      node.path,
                    );
                  }
                });
              } else if (typeof condActions === "string") {
                actions.addEventToItem(
                  condActions,
                  transition.eventType,
                  node.path,
                );
              }
            });
          }
          return {
            name: action.type,
            event: transition.eventType,
          };
        });
      }
    });
  });

  allStateNodes?.forEach((node) => {
    const allActions: XState.ActionObject<any, any>[] = [];
    allActions.push(...node.onExit);
    allActions.push(...node.onEntry);

    allActions?.forEach((action) => {
      if (xstateRegex.test(action.type) || action.exec) return;
      actions.addItem(action.type, node.path);
    });

    node.onEntry?.forEach((action) => {
      const sources = nodeMap[node.id].sources;
      sources?.forEach((source) => {
        actions.addEventToItem(action.type, source, node.path);
      });
    });
  });

  const subState: SubState = makeSubStateFromNode(machine, machine, nodeMap);

  return {
    states: Object.entries(nodeMap).map(([stateId, state]) => {
      return {
        id: stateId,
        sources: state.sources,
      };
    }),
    stateMatches: getMatchesStates(machine),
    subState,
    guards: guards.toDataShape(),
    actions: actions.toDataShape(),
    services: services.toDataShape(),
    activities: activities.toDataShape(),
    delays: delays.toDataShape(),
  };
};
