XState VSCode enhances the XState development experience by providing VSCode users with features like visual editing, autocomplete, typegen and linting.

## Installation

**[Install via the Visual Studio Code Marketplace →](https://marketplace.visualstudio.com/items?itemName=statelyai.stately-vscode)**

## Features

### Visually edit machines

Edit any XState machine with drag-and-drop using the [Stately Visual editor](https://stately.ai/editor).

<img src="https://raw.githubusercontent.com/statelyai/xstate-tools/main/assets/editor.png" alt="" />

### Autocomplete

Intelligent suggestions for transition targets and initial states.

<img src="https://raw.githubusercontent.com/statelyai/xstate-tools/main/assets/autocomplete.png" alt="" />

### Linting

Highlights errors and potential bugs in your XState machine definitions.

<img src="https://raw.githubusercontent.com/statelyai/xstate-tools/main/assets/linting.png" alt="" />

### Jump to definition

Navigate around machines easily with jump to definition on targets, actions, guards, services and more.

<img src="https://raw.githubusercontent.com/statelyai/xstate-tools/main/assets/jump-to-definition.png" alt="" />

## Hints and Tips

### Ignoring machines

If you'd like to ignore linting/autocomplete on a machine, add a `// xstate-ignore-next-line` comment on the line above it:

```ts
// xstate-ignore-next-line
createMachine({});
```

### Refactors

Click the lightbulb when hovering an named action, guard or service in a machine to see available refactors.
