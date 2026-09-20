# My College Routine

A mobile-first Android app for organizing a student's academic routine in one place. The application combines schedules, tasks, habits, notes, exams, reminders, and selected daily utilities in a single interface.

## Features

- Manage lecture and class schedules.
- Track appointments and exams.
- Create tasks and personal notes.
- Build habits with reminder notifications.
- Use prayer, Qibla, and adhkar utilities.
- Build a production-ready Android package through GitHub Actions.

## Tech stack

- React 18
- Capacitor 8
- JavaScript and JSX
- Lucide React
- Android Gradle tooling
- GitHub Actions for automated APK builds

## Project structure

```text
src/                    Application source
android/                Native Android project generated for Capacitor
www/                    Web build output used by the Android shell
.github/workflows/      Automated APK build workflow
capacitor.config.ts     Capacitor configuration
package.json            Project scripts and dependencies
```

## Local development

Install the dependencies and build the web bundle:

```bash
npm install
npm run build
```

The build command bundles the React application, synchronizes the Android platform, and prepares the project for a local Android build.

## Build an APK with GitHub Actions

The repository includes a workflow at `.github/workflows/build-apk.yml`. It runs on pushes to `main` or `master`, and it can also be started manually from the **Actions** tab.

When the workflow finishes, download the `app-debug-apk` artifact from the completed run. The generated file is intended for testing and personal use; a release build should be configured separately before distribution.

## Project status

This is a learning and product-development project. The application is being improved incrementally as new features and usability refinements are added.

## Author

Ahmed Alaa Bahr — [LinkedIn](https://www.linkedin.com/in/ahmed-alaa-897a633a8)
