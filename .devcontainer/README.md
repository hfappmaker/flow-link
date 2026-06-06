# flow-link DevContainer

## Start

```powershell
docker compose -f .devcontainer\docker-compose.yml up -d
```

VS Code Dev Containers can also open this folder directly and will run
`.devcontainer/post-create.sh`.

## Codex App SSH

The host SSH alias is:

```bash
ssh flow-link-devcontainer
```

Use this workspace path in Codex App after connecting:

```bash
/workspaces/flow-link
```

The SSH port is bound to `127.0.0.1:2222`, and authentication uses the host key
at `~/.ssh/flow-link-devcontainer_ed25519`. The matching public key is stored in
`.devcontainer/ssh/authorized_keys`.

## App Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run prisma:generate
npm run prisma:migrate
```
