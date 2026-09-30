## ADDED Requirements

### Requirement: Attachments are picked through the OS dialog in the desktop app
In the desktop app the AI panel's attach menu SHALL open the operating system's files dialog (several files) or folder dialog, and Studio SHALL copy the picks into its attachments folder by path. No picked file's bytes SHALL pass through the page unless the file is small and of a kind the composer renders itself.

#### Scenario: A folder is picked
- **WHEN** the person picks a folder holding `sales/2024.csv` and `README.md`
- **THEN** both are copied under `~/ExasolStudio/attachments/<folder>/` with `sales/2024.csv` keeping its subfolder, and one chip named after the folder lists them by their folder-relative names

#### Scenario: The dialog is cancelled
- **WHEN** the person closes the dialog without picking
- **THEN** nothing is attached and nothing is written

#### Scenario: A name is already taken
- **WHEN** `orders.parquet` is picked and `orders.parquet` already exists in the attachments folder
- **THEN** the copy is saved as `orders (2).parquet` and the chip shows that name

### Requirement: Folder picks skip noise and stop at a cap
A folder pick SHALL leave out dotfiles and dot-folders, `node_modules`, `target`, `dist` and `__pycache__`, SHALL stop at 200 files, and the chip SHALL say how many entries were left out.

#### Scenario: A repository folder
- **WHEN** the picked folder contains `.git/`, `node_modules/` and 30 source files
- **THEN** only the 30 source files are copied and the chip reports the skipped count

### Requirement: Sending a saved chip writes nothing
A chip that records files already on disk SHALL, on send, produce only the note that names the saved paths; no bytes SHALL be read from the page or written again.

#### Scenario: A data file picked through the dialog is sent
- **WHEN** a saved `orders.parquet` chip is sent
- **THEN** the message carries the data-file note with its saved path and size, and the attachments folder is unchanged

### Requirement: Small renderable picks keep their preview
A picked image, PDF or short text file at or under 512 KB SHALL be attached as a real file so the composer previews it exactly as a dropped file.

#### Scenario: A screenshot is picked
- **WHEN** a 40 KB PNG is picked through the dialog
- **THEN** its thumbnail shows in the composer and it is sent as an image

### Requirement: Browsers keep the in-page pickers
When Studio runs outside the desktop shell, the attach menu SHALL fall back to the page's own file and folder inputs.

#### Scenario: Web build
- **WHEN** the attach menu is used in a browser
- **THEN** the hidden inputs open and behave as before
