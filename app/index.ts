import { registerRootComponent } from "expo";

// Imported here, as a bare side-effect import, so the background sync task is
// defined while the bundle loads. metro.config.js turns on inlineRequires,
// which defers every *named* import until first use — App.tsx's import of
// this module would otherwise only run when a startup effect first calls into
// it, after loading has finished. A headless background launch runs this
// entry file but mounts no components, so the task must be defined from here.
import "./src/notifications";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
