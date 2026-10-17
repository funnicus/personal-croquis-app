# Architecture

The stack in `compose.yml` consists of six default services on a single Docker
network, plus an optional backup service behind a Compose profile.

| Service               | What it is                                                   | Port        |
| --------------------- | ------------------------------------------------------------ | ----------- |
| `app`                 | SvelteKit frontend, using adapter-node                       | 3000        |
| `db`                  | PostgreSQL 17                                                | 5432        |
| `minio`               | S3-compatible blob storage, API and console                  | 9000 / 9001 |
| `migrate`             | One-shot service that runs DB migrations, then exits         | -           |
| `image-tagger-api`    | FastAPI tagging service, RAM++ plus a VLM via Ollama         | 8000        |
| `image-tagger-worker` | Node worker that claims queued tagging jobs                  | -           |
| `backup`              | Optional `offen/docker-volume-backup` service, profile-gated | -           |

## Upload And Tagging Flow

1. The user uploads images in `app`.
2. The app stores image files in MinIO and image metadata in Postgres.
3. The app enqueues image tagging jobs.
4. `image-tagger-worker` claims queued jobs from Postgres.
5. The worker creates a presigned MinIO URL and sends it to `image-tagger-api`.
6. `image-tagger-api` fetches the image, tags it using RAM++ and Ollama, and
   returns categorized tags.
7. The worker writes tags back to Postgres using the `category/tag-name` naming
   convention.

## Ollama

Ollama is not part of the Compose stack. It runs on the host, and
`image-tagger-api` reaches it through `host.docker.internal:11434`.

On Linux, the stack network is pinned to `172.19.0.0/16` so the host firewall can
allow containers to reach Ollama consistently. See [Deployment](deployment.md)
for the firewall command.

## Storage

The durable application state is:

- `pgdata`: Postgres records for images, tags, and tagging jobs
- `minio`: uploaded image objects

The optional backup profile creates:

- `dbdump`: transient logical SQL dump volume used by the backup service

## Moodboards

The `/moodboards` page lists named boards; `/moodboards/[id]` opens a Svelte Flow
workspace. Images can be dragged from the library or uploaded by dropping files.
The editor supports moving and resizing images, scroll zoom, background panning,
and selection/removal. Board changes autosave after a short pause, with an explicit
Save button and visible failure/retry state.

Postgres stores board names, viewport position/zoom, and revision numbers in
`moodboard`. `moodboard_item` stores each image placement's coordinates, dimensions,
and stacking order, referencing the existing `image` table. The same library image
can appear in several boards or several times in one board without copying its
MinIO object. Deleting a board or removing a placement keeps library images;
deleting a library image removes its placements through foreign-key cascades.

`/api/moodboards` supports listing and creating boards. `/api/moodboards/[id]`
supports loading, saving the full layout, and deleting a board. Saves run in a
transaction and check the previous revision, returning HTTP 409 for stale saves
instead of overwriting another tab's changes. The editor retains unsaved changes
on failure and offers a reload of the saved version. Changes are saved before
internal navigation; closing/reloading with unsaved changes prompts the browser's
leave confirmation.

The existing image upload endpoint also accepts `Accept: application/json`,
returning image IDs/names and individual upload failures for placement on a board.
Ordinary form uploads still redirect to the gallery.
