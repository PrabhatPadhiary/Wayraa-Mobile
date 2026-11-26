import { registerRootComponent } from 'expo';

import { initSentry, withSentry } from './src/config/sentry';
import App from './App';

// Crash reporting first, so errors while starting up are caught too.
initSentry();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(withSentry(App));
