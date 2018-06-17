# Cloud Catcher

A web interface for ComputerCraft computers

## Getting started
 - Visit https://cloud-catcher.squiddev.cc/
 - Follow the instructions there
 - One can run `cloud edit <filename>` to edit a file remotely.

## Features
![Running paint remotely](img/01-run-paint.png "Running paint remotely")

Interact with a computer remotely.

![Editing a file](img/02-file-edit.png "Editing a file")

Open any remote file for inspection, make some modifications, and save it back
to the computer.

![Sharing a session across multiple browsers](img/03-share.png "Sharing a session across multiple browsers")

Share your session with other people, allowing for a true multiplayer-notepad.

## Contributing
Contributions are more than welcome to Cloud Catcher, though I warn you the code does get rather messy at times. I
should warn you that building CC does get a little messy: it requires `make`, `lua` and Node.

 - Clone the repository and `cd` into it as normal.
 - Run `npm install` to get all node dependencies.
 - Run `make serve` in order to run a development server (on port `:8080`) or `make dist` to generate a distribution.

You can also run `make SERVER=cc.fancy.com dist` (or similar) to generate a build using an alternative server name. You
may need to run `make clean` before changing this, to ensure files are regenerated.
