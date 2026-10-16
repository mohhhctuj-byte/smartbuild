import type { Express } from "express";
import { ENV } from "./env";
import { findLocalAttachment } from "../localAttachmentStorage";
import { createContext } from "./context";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const localFile = await findLocalAttachment(key);
      if (localFile) {
        const context = await createContext({ req, res, info: {} as never });
        if (!context.user || context.user.id !== localFile.userId || context.isDemo) {
          res.status(context.isDemo ? 403 : 401).send("Sign in to access this attachment.");
          return;
        }
        res.set("Cache-Control", "private, no-store");
        res.set("X-Content-Type-Options", "nosniff");
        if (/^(?:image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm|quicktime)|audio\/(?:mpeg|wav|ogg|mp4))$/.test(localFile.mimeType)) {
          res.set("Content-Type", localFile.mimeType);
          res.set("Content-Disposition", "inline");
        } else {
          res.set("Content-Type", "application/octet-stream");
          res.set("Content-Disposition", "attachment");
        }
        res.sendFile(localFile.absolutePath);
        return;
      }
    } catch (err) {
      console.error("[StorageProxy] local attachment lookup failed:", err);
      res.status(500).send("Local attachment storage error");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
