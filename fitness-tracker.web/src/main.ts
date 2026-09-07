import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Material measures the floating label once at init, so the label font must be in before the first render.
document.fonts.load('400 16px Sora').catch(() => {}).then(() =>
  bootstrapApplication(App, appConfig).catch((err) => console.error(err)));
