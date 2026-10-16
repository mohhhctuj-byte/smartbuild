# Veyra Desktop Wrapper

This directory reserves the desktop integration boundary for Veyra. The Manus Preview remains the source of truth for the web workspace, while a future desktop wrapper can load the same frontend and add local project-folder capabilities.

## Required next step

Before implementing direct local-file access, bind a local folder in Manus Desktop. The wrapper must receive an explicit user-selected folder; it must never scan or access arbitrary device paths.

## Planned desktop capabilities

The desktop build will add a local project bridge for opening a selected folder, reading and writing approved project files, opening a local preview, and exporting generated assets. Cloud services will continue to handle the Manus LLM, workspace persistence, and object storage unless the user explicitly enables an offline/local provider.

The current web application is intentionally kept independent from this wrapper so that the Manus Preview and a future installed app share the same conversation, design, and generated-file experience.
