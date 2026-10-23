# Repository Guidelines

## Project Structure & Module Organization

This repository is currently an empty project directory. No source code, tests, assets, or build configuration have been added. Establish the directory layout with the first implementation and update this guide accordingly.

When introducing a structure, group application code under `src/`, automated tests under `tests/`, and static resources under `assets/` where appropriate. Keep configuration files at the repository root. Avoid creating empty directories solely to match this suggested layout.

## Build, Test, and Development Commands

No development, build, lint, or test commands are configured yet. When selecting a toolchain, provide reproducible commands through its standard manifest or a task runner, and document the exact commands in `README.md`.

Document dependency installation, local startup, production builds, and test execution. Do not assume commands such as `npm test` exist until their configuration is committed.

## Coding Style & Naming Conventions

Follow the conventions of the language and framework introduced by the project. Configure a formatter and linter early, and keep their settings in version control. Match existing indentation and naming when extending established code. Use descriptive filenames and identifiers, and keep modules focused on a single responsibility.

## Testing Guidelines

No testing framework or coverage threshold is established. Introduce automated tests alongside meaningful behavior. Use descriptive test names that identify the behavior and expected outcome. Document the test runner, file naming convention, and execution command when tests are added.

## Commit & Pull Request Guidelines

No Git history is available to establish commit conventions. Use concise, imperative commit subjects, such as `Add initial application structure`, and keep changes focused.

Pull requests should explain the change, include validation performed, and link relevant issues. Add screenshots for visible interface changes. Explicitly note any unavailable checks or required configuration.

## Security & Configuration

Never commit credentials or local secrets. When environment configuration is introduced, provide a sanitized example file and ignore local overrides and generated artifacts.
