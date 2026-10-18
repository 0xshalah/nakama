import { z } from "@hono/zod-openapi";
import type {
  AgentGroup,
  AgentGroupSession,
  AgentGroupSessionDetail,
  ListAgentGroupSessionsResponse,
  ListAgentGroupsResponse,
} from "@nakama/core/agent-groups";
import { AgentGroupService } from "../../services/agent-group-service";
import type { ServerOptions } from "../context";
import {
  requireActiveOrgIdFromContext,
  requireOrgMemberFromContext,
} from "../org-guards";
import { json, readJson } from "../shared";
import type { HonoApp } from "../types";

const groupSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(2).max(12),
  name: z.string().trim().min(1).max(80),
});

const imageSchema = z.object({ data: z.string(), mediaType: z.string() });

const messageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

const sessionChangesSchema = z
  .object({
    pinned: z.boolean().optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .refine((changes) => changes.pinned !== undefined || changes.title, {
    message: "Nothing to change",
  });

function logRunFailure(groupId: string) {
  return (error: Error) => {
    console.error("[agent-groups] reply run failed", { error, groupId });
  };
}

export function registerAgentGroupRoutes(
  app: HonoApp,
  options: ServerOptions
): void {
  if (!options.databaseAdapter) {
    return;
  }

  // Built once so the in-memory run state lives as long as the process.
  const service = new AgentGroupService(options.databaseAdapter, options.agent);

  app.get("/v1/agent-groups", (c) => {
    const auth = requireOrgMemberFromContext(c);

    return json<ListAgentGroupsResponse>({
      groups: service.list(requireActiveOrgIdFromContext(c), auth.user.id),
    });
  });

  app.post("/v1/agent-groups", async (c) => {
    const auth = requireOrgMemberFromContext(c);
    const orgId = requireActiveOrgIdFromContext(c);
    const body = await readJson(c.req.raw, groupSchema);

    return json<AgentGroup>(
      await service.create(orgId, auth.user.id, body.name, body.memberIds),
      201
    );
  });

  app.get("/v1/agent-groups/:groupId", (c) => {
    const auth = requireOrgMemberFromContext(c);

    return json<AgentGroup>(
      service.get(
        requireActiveOrgIdFromContext(c),
        auth.user.id,
        c.req.param("groupId")
      )
    );
  });

  app.put("/v1/agent-groups/:groupId", async (c) => {
    const auth = requireOrgMemberFromContext(c);
    const orgId = requireActiveOrgIdFromContext(c);
    const body = await readJson(c.req.raw, groupSchema);

    return json<AgentGroup>(
      await service.update(
        orgId,
        auth.user.id,
        c.req.param("groupId"),
        body.name,
        body.memberIds
      )
    );
  });

  app.delete("/v1/agent-groups/:groupId", (c) => {
    const auth = requireOrgMemberFromContext(c);
    service.delete(
      requireActiveOrgIdFromContext(c),
      auth.user.id,
      c.req.param("groupId")
    );

    return c.body(null, 204);
  });

  app.get("/v1/agent-groups/:groupId/avatar", (c) => {
    const auth = requireOrgMemberFromContext(c);

    const avatar = service.avatar(
      requireActiveOrgIdFromContext(c),
      auth.user.id,
      c.req.param("groupId")
    );

    return new Response(new Uint8Array(avatar.bytes), {
      headers: { "Content-Type": avatar.mediaType },
    });
  });

  app.put("/v1/agent-groups/:groupId/avatar", async (c) => {
    const auth = requireOrgMemberFromContext(c);
    const orgId = requireActiveOrgIdFromContext(c);
    const image = await readJson(c.req.raw, imageSchema);
    service.setAvatar(orgId, auth.user.id, c.req.param("groupId"), image);

    return c.body(null, 204);
  });

  app.delete("/v1/agent-groups/:groupId/avatar", (c) => {
    const auth = requireOrgMemberFromContext(c);
    service.removeAvatar(
      requireActiveOrgIdFromContext(c),
      auth.user.id,
      c.req.param("groupId")
    );

    return c.body(null, 204);
  });

  app.get("/v1/agent-groups/:groupId/sessions", (c) => {
    const auth = requireOrgMemberFromContext(c);

    return json<ListAgentGroupSessionsResponse>({
      sessions: service.sessions(
        requireActiveOrgIdFromContext(c),
        auth.user.id,
        c.req.param("groupId")
      ),
    });
  });

  app.post("/v1/agent-groups/:groupId/sessions", async (c) => {
    const auth = requireOrgMemberFromContext(c);
    const orgId = requireActiveOrgIdFromContext(c);
    const groupId = c.req.param("groupId");
    const { content } = await readJson(c.req.raw, messageSchema);

    const { run, session } = service.start(
      orgId,
      auth.user.id,
      groupId,
      content
    );

    // The reply run outlives the request; the page polls the session for it.
    run.catch(logRunFailure(groupId));

    return json<AgentGroupSession>(session, 201);
  });

  app.get("/v1/agent-groups/:groupId/sessions/:sessionId", (c) => {
    const auth = requireOrgMemberFromContext(c);

    return json<AgentGroupSessionDetail>(
      service.session(
        requireActiveOrgIdFromContext(c),
        auth.user.id,
        c.req.param("groupId"),
        c.req.param("sessionId")
      )
    );
  });

  app.patch("/v1/agent-groups/:groupId/sessions/:sessionId", async (c) => {
    const auth = requireOrgMemberFromContext(c);
    const orgId = requireActiveOrgIdFromContext(c);
    const changes = await readJson(c.req.raw, sessionChangesSchema);
    service.updateSession(
      orgId,
      auth.user.id,
      c.req.param("groupId"),
      c.req.param("sessionId"),
      changes
    );

    return c.body(null, 204);
  });

  app.delete("/v1/agent-groups/:groupId/sessions/:sessionId", (c) => {
    const auth = requireOrgMemberFromContext(c);
    service.deleteSession(
      requireActiveOrgIdFromContext(c),
      auth.user.id,
      c.req.param("groupId"),
      c.req.param("sessionId")
    );

    return c.body(null, 204);
  });

  app.post(
    "/v1/agent-groups/:groupId/sessions/:sessionId/messages",
    async (c) => {
      const auth = requireOrgMemberFromContext(c);
      const orgId = requireActiveOrgIdFromContext(c);
      const groupId = c.req.param("groupId");
      const { content } = await readJson(c.req.raw, messageSchema);

      service
        .post(orgId, auth.user.id, groupId, c.req.param("sessionId"), content)
        .catch(logRunFailure(groupId));

      return c.body(null, 204);
    }
  );

  app.post("/v1/agent-groups/:groupId/sessions/:sessionId/stop", (c) => {
    const auth = requireOrgMemberFromContext(c);
    service.stop(
      requireActiveOrgIdFromContext(c),
      auth.user.id,
      c.req.param("groupId"),
      c.req.param("sessionId")
    );

    return c.body(null, 204);
  });
}
