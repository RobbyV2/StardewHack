﻿using StardewModdingAPI;
using System.Net;
using StardewValley.Network;
using StardewValley.Locations;
using StardewModdingAPI.Events;
using System.Threading.Tasks;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using Internationalization.Handlers;
using System.Reflection;

namespace Internationalization
{
    public class ModEntry : Mod {
        const string URI = "http://localhost:8018/";

        private HttpListener server;
        private Task<HttpListenerContext> task;
        Dictionary<string,RequestHandler> handlers;

        public override void Entry(IModHelper helper) {
            I18n.Init(helper.Translation);
            TranslationRegistry.Init(Helper.ModRegistry);

            // Start a webserver.
            server = new HttpListener();
            server.Prefixes.Add(URI);
            server.Start();

            // Location from where to serve static stuff.
            handlers = new Dictionary<string, RequestHandler> {
                {"static", new StaticHandler(Path.Combine(Helper.DirectoryPath, "Static"))},
                {"mods",   new ModList()},
            };

            Monitor.Log("Translation website available at: " + URI, LogLevel.Alert);

            Helper.Events.GameLoop.UpdateTicking += process;
        }

        private void process(object sender, UpdateTickingEventArgs e) {
            if (task == null) {
                task = server.GetContextAsync();
            }
            if (!task.IsCompleted) return;
            var req = new Request(task.Result);
            task = null;

            if (req.path.Length == 0) req.path = new string[]{"static", "index.html"};

            if (handlers.TryGetValue(req.path[0], out var handler)) {
                req.path = req.path.Skip(1).ToArray();
                try {
                    req.status(handler.handle(req));
                } catch (System.Exception ex) {
                    req.write_text(ex.ToString());
                    req.status(HttpStatusCode.InternalServerError);
                }
            } else {
                req.status(HttpStatusCode.NotFound);
                req.write_text("No handler for: " + string.Join("/", req.path));
                Monitor.Log("No handler for: " + string.Join("/", req.path));
            }
            req.res.Close();
        }
    }
}
