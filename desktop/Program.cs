// Compagnon Enshrouded — application Windows.
// Affiche le site du serveur de la maison dans une fenêtre, plus un overlay discret par-dessus le jeu.
// Compilé avec le compilateur C# intégré à Windows (C# 5) : voir build.ps1. Aucune installation requise.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using Microsoft.Win32;
using System.IO.Compression;

[assembly: AssemblyTitle("Compagnon Enshrouded")]
[assembly: AssemblyProduct("Compagnon Enshrouded")]
[assembly: AssemblyDescription("Compagnon Enshrouded : builds, ressources, overlay en jeu")]
[assembly: AssemblyVersion("2.2.3.0")]
[assembly: AssemblyFileVersion("2.2.3.0")] // garder identique à AssemblyVersion

namespace Compagnon
{
    static class Program
    {
        public const string AppName = "Compagnon Enshrouded";
        public const string ExeName = "CompagnonEnshrouded.exe";
        public const string UpdateBase = "https://github.com/LeVieuxSinge38/compagnon-enshrouded/releases/latest/download/";
        public static readonly string[] AppFiles = { ExeName, "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll" };
        public static readonly string LocalAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        public static readonly string InstallDir = Path.Combine(LocalAppData, "Programs", AppName);
        // Les pages du Compagnon sont livrées avec l'appli (dossier « web ») et servies sous une adresse interne
        public const string Host = "compagnon.local";
        public static string WebDir { get { string n = "web"; try { string p = Path.Combine(ExeDir, "webdir.txt"); if (File.Exists(p)) { string l = File.ReadLines(p).First(); if (!string.IsNullOrWhiteSpace(l)) n = l.Trim(); } } catch { } return Path.Combine(ExeDir, n); } }
        public static string PageUrl(string page) { return "https://" + Host + "/" + page.TrimStart('/'); }
        // Profil séparé pour les tests (variable d'environnement COMPAGNON_PROFILE) : réglages, connexion et instance à part
        static readonly string Profile = Environment.GetEnvironmentVariable("COMPAGNON_PROFILE") ?? "";
        public static readonly string DataDir = Path.Combine(LocalAppData, AppName + (Profile.Length > 0 ? " (" + Profile + ")" : ""));
        public static string ExeDir { get { return Path.GetDirectoryName(Application.ExecutablePath); } }
        public static Version CurrentVersion { get { return Assembly.GetExecutingAssembly().GetName().Version; } }

        static Mutex mutex;
        public static EventWaitHandle ShowSignal;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Directory.CreateDirectory(DataDir);

            // Une seule instance : si l'appli tourne déjà, on lui demande d'afficher sa fenêtre.
            bool created;
            mutex = new Mutex(true, @"Local\CompagnonEnshrouded" + Profile, out created);
            ShowSignal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\CompagnonEnshrouded" + Profile + ".Show");
            if (!created)
            {
                bool updated = args.Contains("--updated");
                if (!updated) { ShowSignal.Set(); return; }
                // Redémarrage après mise à jour : on attend que l'ancienne version se ferme.
                try { if (!mutex.WaitOne(15000)) return; } catch (AbandonedMutexException) { }
            }

            Config.Load();
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Installer.CleanupOldFiles();
            if (Installer.IsInstalled) Installer.MigrateAutoStart();

            if (!Installer.IsInstalled && !args.Contains("--portable"))
            {
                if (Installer.OfferInstall()) return; // la copie installée a été lancée
            }

            if (!Installer.EnsureWeb()) return;

            // Après une mise à jour hors du jeu, on rouvre la fenêtre : c'est là qu'on a cliqué « Mettre à jour »
            bool hidden = args.Contains("--watch") || (args.Contains("--tray") && !(args.Contains("--updated") && !TrayApp.GameRunning()));
            Application.Run(new TrayApp(hidden));
            GC.KeepAlive(mutex);
        }
    }

    // ---------- Connexion chiffrée (HTTPS) avec le certificat du serveur épinglé ----------
    // Le serveur de la maison a son propre certificat (auto-signé). L'appli ne fait confiance qu'à LUI : son empreinte
    // SHA-256 est écrite ci-dessous. Un autre appareil du réseau ne peut donc pas se faire passer pour le serveur.
    // ---------- Réglages (fichier texte clé=valeur dans %LOCALAPPDATA%\Compagnon Enshrouded) ----------
    static class Config
    {
        static string FilePath { get { return Path.Combine(Program.DataDir, "config.txt"); } }
        public static string SaveDir = "";                // dossier des sauvegardes choisi à la main (sinon trouvé dans Steam)
        public static bool ShowWithGame = true;
        public static double Opacity = 0.92;
        public static Rectangle OverlayBounds = Rectangle.Empty;
        public static bool Collapsed = false;              // overlay réduit en bulle
        public static Point BubblePos = new Point(-1, -1);

        public static void Load()
        {
            if (!File.Exists(FilePath)) return;
            var d = new Dictionary<string, string>();
            foreach (var line in File.ReadAllLines(FilePath))
            {
                int i = line.IndexOf('=');
                if (i > 0) d[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
            }
            string v;
            if (d.TryGetValue("SaveDir", out v)) SaveDir = v;
            if (d.TryGetValue("ShowWithGame", out v)) ShowWithGame = v == "1";
            double o;
            if (d.TryGetValue("Opacity", out v) && double.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out o)) Opacity = Math.Max(0.4, Math.Min(1, o));
            if (d.TryGetValue("Overlay", out v))
            {
                var p = v.Split(',').Select(s => { int n; return int.TryParse(s, out n) ? n : 0; }).ToArray();
                if (p.Length == 4) OverlayBounds = new Rectangle(p[0], p[1], p[2], p[3]);
            }
            if (d.TryGetValue("Collapsed", out v)) Collapsed = v == "1";
            if (d.TryGetValue("Bubble", out v))
            {
                var p = v.Split(',').Select(s => { int n; return int.TryParse(s, out n) ? n : -1; }).ToArray();
                if (p.Length == 2) BubblePos = new Point(p[0], p[1]);
            }
        }

        public static void Save()
        {
            var b = OverlayBounds;
            File.WriteAllLines(FilePath, new[] {
                "SaveDir=" + SaveDir,
                "ShowWithGame=" + (ShowWithGame ? "1" : "0"),
                "Opacity=" + Opacity.ToString(System.Globalization.CultureInfo.InvariantCulture),
                "Overlay=" + b.X + "," + b.Y + "," + b.Width + "," + b.Height,
                "Collapsed=" + (Collapsed ? "1" : "0"),
                "Bubble=" + BubblePos.X + "," + BubblePos.Y
            });
        }

    }

    // ---------- Installation, démarrage avec Windows, mises à jour ----------
    static class Installer
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        public static bool IsInstalled
        {
            get { return string.Equals(Path.GetFullPath(Program.ExeDir).TrimEnd('\\'), Path.GetFullPath(Program.InstallDir).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase); }
        }

        public static bool OfferInstall()
        {
            var r = MessageBox.Show(
                "Installer le Compagnon Enshrouded sur ce PC ?\n\n" +
                "• Copie dans " + Program.InstallDir + " (environ 1 Mo)\n" +
                "• Raccourcis dans le menu Démarrer et sur le Bureau\n" +
                "• Le Compagnon se lance tout seul quand tu lances Enshrouded (rien ne tourne avec tes autres jeux)\n\n" +
                "Aucun droit administrateur n'est nécessaire. « Non » lance l'appli sans l'installer.",
                Program.AppName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (r == DialogResult.Cancel) return true;
            if (r == DialogResult.No) return false;
            try
            {
                Directory.CreateDirectory(Program.InstallDir);
                foreach (var f in Program.AppFiles)
                    File.Copy(Path.Combine(Program.ExeDir, f), Path.Combine(Program.InstallDir, f), true);
                CopyDir(Program.WebDir, Path.Combine(Program.InstallDir, "web"));
                string exe = Path.Combine(Program.InstallDir, Program.ExeName);
                CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Program.AppName + ".lnk"), exe);
                CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Program.AppName + ".lnk"), exe);
                SetAutoStart(true, exe);
                Process.Start(exe);
                MessageBox.Show("Installation terminée ! Tu peux supprimer le fichier zip et le dossier téléchargés.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show("L'installation a échoué : " + ex.Message + "\nL'appli va se lancer sans être installée.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }

        static void CreateShortcut(string lnk, string target)
        {
            // Raccourci .lnk via l'objet COM WScript.Shell, présent sur tous les Windows.
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(t);
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
            Type st = sc.GetType();
            st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { Path.GetDirectoryName(target) });
            st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { Program.AppName });
            st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            Marshal.FinalReleaseComObject(sc);
            Marshal.FinalReleaseComObject(shell);
        }

        public static bool AutoStart
        {
            get { using (var k = Registry.CurrentUser.OpenSubKey(RunKey)) return k != null && k.GetValue(Program.AppName) != null; }
        }

        public static void SetAutoStart(bool on, string exe)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(Program.AppName, "\"" + exe + "\" --watch");
                else k.DeleteValue(Program.AppName, false);
            }
        }

        // Les anciennes versions démarraient l'appli complète avec Windows (--tray) : on passe au guet du jeu (--watch).
        public static void MigrateAutoStart()
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    var v = k == null ? null : k.GetValue(Program.AppName) as string;
                    if (v != null && v.EndsWith(" --tray")) k.SetValue(Program.AppName, v.Substring(0, v.Length - 7) + " --watch");
                }
            }
            catch { }
        }

        static void CopyDir(string src, string dst)
        {
            if (!Directory.Exists(src)) return;
            Directory.CreateDirectory(dst);
            foreach (var d in Directory.GetDirectories(src, "*", SearchOption.AllDirectories)) Directory.CreateDirectory(dst + d.Substring(src.Length));
            foreach (var file in Directory.GetFiles(src, "*", SearchOption.AllDirectories)) File.Copy(file, dst + file.Substring(src.Length), true);
        }

        // Pages absentes (mise à jour depuis une 1.x, qui ne connaissait pas le dossier « web ») : on les télécharge une fois
        public static bool EnsureWeb()
        {
            if (File.Exists(Path.Combine(Program.WebDir, "index.html"))) return true;
                try
                {
                    string zip = Path.Combine(Program.ExeDir, "web.zip");
                    using (var wc = new WebClient()) wc.DownloadFile(Program.UpdateBase + "web.zip", zip);
                    InstallWeb(zip);
                    return true;
                }
                catch (Exception ex) { MessageBox.Show("Impossible de télécharger les pages du Compagnon : " + ex.Message, Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error); return false; }
            MessageBox.Show("Le dossier « web » du Compagnon est introuvable. Réinstalle l'appli à partir du zip complet.", Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }

        // Décompresse web.zip à côté puis remplace le dossier « web » (l'ancien est supprimé au prochain démarrage)
        public static void InstallWeb(string zip)
        {
            string dir = Program.ExeDir, neu = Path.Combine(dir, "web.new"), old = Path.Combine(dir, "web.old");
            if (Directory.Exists(neu)) Directory.Delete(neu, true);
            ZipFile.ExtractToDirectory(zip, neu);
            if (Directory.Exists(old)) Directory.Delete(old, true);
            if (Directory.Exists(Program.WebDir)) Directory.Move(Program.WebDir, old);
            Directory.Move(neu, Program.WebDir);
            try { File.Delete(zip); } catch { }
        }

        public static void CleanupOldFiles()
        {
            try { string old = Path.Combine(Program.ExeDir, "web.old"); if (Directory.Exists(old)) Directory.Delete(old, true); } catch { }
            try { foreach (var d in Directory.GetDirectories(Program.ExeDir, "web-*")) { if (d != Program.WebDir) Directory.Delete(d, true); } } catch { }
            foreach (var f in Program.AppFiles)
            {
                string old = Path.Combine(Program.ExeDir, f + ".old");
                try { if (File.Exists(old)) File.Delete(old); } catch { }
            }
        }

        public static void Uninstall()
        {
            SetAutoStart(false, null);
            foreach (var lnk in new[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Program.AppName + ".lnk"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Program.AppName + ".lnk") })
                try { File.Delete(lnk); } catch { }
            // Le dossier est supprimé juste après la fermeture de l'appli.
            if (IsInstalled)
                Process.Start(new ProcessStartInfo("cmd.exe", "/c timeout /t 2 /nobreak >nul & rmdir /s /q \"" + Program.InstallDir + "\" & rmdir /s /q \"" + Program.DataDir + "\"")
                { CreateNoWindow = true, UseShellExecute = false });
        }

        // ----- Mises à jour : le serveur publie /downloads/desktop.json et les fichiers de l'appli -----
        public class UpdateInfo { public string version; public string notes; public string[] highlights; public string[] files; public string web; public string webBuild; }

        public static string LocalWebBuild()
        {
            try { string p = Path.Combine(Program.WebDir, "build.txt"); if (File.Exists(p)) return File.ReadAllText(p).Trim(); } catch { }
            return "";
        }

        public static bool PagesOnly(UpdateInfo i)
        {
            Version v;
            return Version.TryParse(i.version, out v) && v <= Program.CurrentVersion;
        }

        public static UpdateInfo CheckUpdate()
        {
            using (var wc = new WebClient())
            {
                wc.Encoding = System.Text.Encoding.UTF8;
                wc.Headers[HttpRequestHeader.CacheControl] = "no-cache";
                var info = new JavaScriptSerializer().Deserialize<UpdateInfo>(wc.DownloadString(Program.UpdateBase + "desktop.json"));
                Version v;
                if (info == null) return null; bool newer = Version.TryParse(info.version, out v) && v > Program.CurrentVersion; bool pages = !string.IsNullOrEmpty(info.webBuild) && info.webBuild != LocalWebBuild(); if (!newer && !pages) return null;
                return info;
            }
        }

        public static bool ApplyUpdate(UpdateInfo info, bool showMain, Action<int> progress)
        {
            string dir = Program.ExeDir;
            if (PagesOnly(info))
            {
                using (var wc = new WebClient())
                {
                    wc.DownloadFileTaskAsync(Program.UpdateBase + "web.zip", Path.Combine(dir, "web.zip")).Wait();
                }
                string target = Path.Combine(dir, "web-" + info.webBuild);
                if (Directory.Exists(target)) Directory.Delete(target, true);
                System.IO.Compression.ZipFile.ExtractToDirectory(Path.Combine(dir, "web.zip"), target);
                File.WriteAllText(Path.Combine(dir, "webdir.txt"), "web-" + info.webBuild + "\n");
                return false;
            }
            var files = (info.files != null && info.files.Length > 0) ? info.files : Program.AppFiles;
            int total = files.Length + (string.IsNullOrEmpty(info.web) ? 0 : 1);
            int done = 0;
            using (var wc = new WebClient())
            {
                foreach (var f in files)
                {
                    if (Path.GetFileName(f) != f) throw new InvalidDataException("Nom de fichier invalide : " + f);
                    int idx = done;
                    DownloadProgressChangedEventHandler h = null;
                    h = (s, e) => { if (progress != null) progress((idx * 100 + e.ProgressPercentage) / total); };
                    wc.DownloadProgressChanged += h;
                    wc.DownloadFileTaskAsync(Program.UpdateBase + f, Path.Combine(dir, f + ".new")).Wait();
                    wc.DownloadProgressChanged -= h;
                    done++;
                    if (progress != null) progress(done * 100 / total);
                }
                if (!string.IsNullOrEmpty(info.web))
                {
                    if (Path.GetFileName(info.web) != info.web) throw new InvalidDataException("Nom de fichier invalide : " + info.web);
                    int idx = done;
                    DownloadProgressChangedEventHandler h2 = null;
                    h2 = (s, e) => { if (progress != null) progress((idx * 100 + e.ProgressPercentage) / total); };
                    wc.DownloadProgressChanged += h2;
                    wc.DownloadFileTaskAsync(Program.UpdateBase + info.web, Path.Combine(dir, "web.zip")).Wait();
                    wc.DownloadProgressChanged -= h2;
                    done++;
                    if (progress != null) progress(100);
                }
            }
            if (!string.IsNullOrEmpty(info.web)) InstallWeb(Path.Combine(dir, "web.zip"));
            foreach (var f in files)
            {
                string cur = Path.Combine(dir, f), old = cur + ".old";
                if (File.Exists(old)) File.Delete(old);
                if (File.Exists(cur)) File.Move(cur, old);
                File.Move(cur + ".new", cur);
            }
            Process.Start(Path.Combine(dir, Program.ExeName), showMain ? "--updated" : "--updated --tray");
            return true;
        }
    }

    // ---------- Moteur d'affichage partagé (mêmes cookies, donc même connexion, pour les deux fenêtres) ----------
    static class Web
    {
        static Task<CoreWebView2Environment> env;
        public static event Action<WebView2, string> Message; // messages de toutes les pages (relais réseau, sauvegardes…)
        public static readonly Color Background = Color.FromArgb(18, 15, 23);

        public static async void Remap(WebView2 view)
        {
            if (view.CoreWebView2 != null)
            {
                view.CoreWebView2.ClearVirtualHostNameToFolderMapping(Program.Host);
                view.CoreWebView2.SetVirtualHostNameToFolderMapping(Program.Host, Program.WebDir, CoreWebView2HostResourceAccessKind.Allow);
                try { await view.CoreWebView2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache); } catch { }
                view.CoreWebView2.Reload();
            }
        }

        public static async void Attach(WebView2 view, string path, bool overlay, Action<string> onMessage = null)
        {
            try
            {
                if (env == null) env = CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDir, "WebView2"),
                    new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required")); // musique de l'intro
                await view.EnsureCoreWebView2Async(await env);
                try { await view.CoreWebView2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache); } catch { } // pages locales : jamais l'ancienne version en cache
                var core = view.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping(Program.Host, Program.WebDir, CoreWebView2HostResourceAccessKind.Allow);
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsZoomControlEnabled = !overlay;
                if (overlay) core.Settings.AreDefaultContextMenusEnabled = false;
                // Seules les pages du Compagnon s'affichent dans l'appli ; les autres liens s'ouvrent dans le navigateur.
                core.NavigationStarting += (s, e) =>
                {
                    if (!e.Uri.StartsWith(Program.PageUrl(""), StringComparison.OrdinalIgnoreCase))
                    {
                        e.Cancel = true;
                        OpenExternal(e.Uri);
                    }
                };
                core.NewWindowRequested += (s, e) => { e.Handled = true; OpenExternal(e.Uri); };
                core.WebMessageReceived += (s, e) =>
                {
                    // On n'écoute que les pages du Compagnon
                    if (!e.Source.StartsWith(Program.PageUrl(""), StringComparison.OrdinalIgnoreCase)) return;
                    string m = null;
                    try { m = e.TryGetWebMessageAsString(); } catch { }
                    if (m == null) return;
                    if (Message != null) Message(view, m);
                    if (onMessage != null) onMessage(m);
                };
                view.Source = new Uri(Program.PageUrl(path == "/" ? "index.html" : path));
            }
            catch (Exception ex)
            {
                MessageBox.Show("Impossible de démarrer l'affichage (WebView2) : " + ex.Message, Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void OpenExternal(string uri)
        {
            if (uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
        }

        public static void Post(WebView2 view, string json)
        {
            try { if (view != null && view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(json); } catch { }
        }

        public static WebView2 Create()
        {
            var w = new WebView2();
            w.Dock = DockStyle.Fill;
            w.DefaultBackgroundColor = Background;
            return w;
        }
    }

    // ---------- Fenêtre principale ----------
    class MainForm : Form
    {
        readonly WebView2 view;
        public WebView2 View { get { return view; } }
        public event Action HelloReceived, UpdateRequested;
        public MainForm()
        {
            Text = Program.AppName;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            BackColor = Web.Background;
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(1300, 880);
            MinimumSize = new Size(480, 400);
            view = Web.Create();
            Controls.Add(view);
            Web.Attach(view, "/", false, m =>
            {
                if (m == "hello" && HelloReceived != null) HelloReceived();
                else if (m == "update" && UpdateRequested != null) UpdateRequested();
            });
        }
        public void Post(string json) { Web.Post(view, json); }
        public void Reload() { if (view.CoreWebView2 != null) view.CoreWebView2.Navigate(Program.PageUrl("index.html")); }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // La croix cache la fenêtre : l'appli reste dans la zone de notification pour l'overlay.
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
            base.OnFormClosing(e);
        }
    }

    // ---------- Overlay par-dessus le jeu ----------
    class OverlayForm : Form
    {
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
        [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
        void RoundCorners()
        {
            var h = CreateRoundRectRgn(0, 0, Width + 1, Height + 1, 16, 16);
            Region = Region.FromHrgn(h);
            DeleteObject(h);
        }
        const int GWL_EXSTYLE = -20, WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80;
        // Panneau aux couleurs du jeu : bleu nuit, liseré bleu
        static readonly Color Frame = Color.FromArgb(34, 62, 84), FrameHover = Color.FromArgb(52, 92, 120), FrameUpdate = Color.FromArgb(56, 170, 96),
            Bar = Color.FromArgb(10, 18, 28), BarText = Color.FromArgb(143, 208, 245);
        const int WM_NCHITTEST = 0x84, WM_NCLBUTTONDOWN = 0xA1, HTCAPTION = 2;
        const int Edge = 6;

        readonly WebView2 view;
        public WebView2 View { get { return view; } }
        readonly Label title;
        public bool ClickThrough { get; private set; }
        bool update;                                    // mise à jour disponible : cadre vert
        public event Action CollapseRequested;
        public event Action<int> BadgeChanged;
        public event Action HelloReceived, UpdateRequested;
        public event Action<string> OpenMapRequested;   // « Afficher sur la carte » depuis l'onglet Ressources
        public event Action CheckRequested;             // la page a vu une nouvelle version : l'appli vérifie tout de suite
        public event Action OpenMainRequested;          // ouvrir le Compagnon complet (bouton ou Ctrl+Maj+C)
        public void Post(string json) { Web.Post(view, json); }

        public OverlayForm()
        {
            Text = Program.AppName + " — overlay";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = Frame;
            Padding = new Padding(Edge);
            Opacity = Config.Opacity;
            MinimumSize = new Size(260, 220);
            var area = Screen.PrimaryScreen.WorkingArea;
            Bounds = (Config.OverlayBounds.Width > 0 && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(Config.OverlayBounds)))
                ? Config.OverlayBounds
                : new Rectangle(area.Right - 380, area.Top + 120, 360, 560);

            view = Web.Create();
            title = new Label
            {
                Dock = DockStyle.Top, Height = 24, ForeColor = BarText, BackColor = Bar,
                Font = new Font("Segoe UI", 8.5f), TextAlign = ContentAlignment.MiddleLeft, Cursor = Cursors.SizeAll
            };
            title.MouseDown += (s, e) =>
            {
                if (e.Button != MouseButtons.Left) return;
                ReleaseCapture();
                SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
            };
            // Bouton « réduire en bulle » à droite de la barre du haut
            var collapse = new Label
            {
                Dock = DockStyle.Right, Width = 30, Text = "—", TextAlign = ContentAlignment.MiddleCenter, Cursor = Cursors.Hand,
                ForeColor = BarText, BackColor = Bar, Font = new Font("Segoe UI", 10f, FontStyle.Bold)
            };
            new ToolTip().SetToolTip(collapse, "Réduire en bulle");
            collapse.MouseEnter += (s, e) => collapse.BackColor = FrameHover;
            collapse.MouseLeave += (s, e) => collapse.BackColor = Bar;
            collapse.Click += (s, e) => { if (CollapseRequested != null) CollapseRequested(); };
            title.Controls.Add(collapse);
            var openMain = new Label
            {
                Dock = DockStyle.Right, Width = 30, Text = "⧉", TextAlign = ContentAlignment.MiddleCenter, Cursor = Cursors.Hand,
                ForeColor = BarText, BackColor = Bar, Font = new Font("Segoe UI Symbol", 10f, FontStyle.Bold)
            };
            new ToolTip().SetToolTip(openMain, "Ouvrir le Compagnon complet (Ctrl+Maj+C)");
            openMain.MouseEnter += (s, e) => openMain.BackColor = FrameHover;
            openMain.MouseLeave += (s, e) => openMain.BackColor = Bar;
            openMain.Click += (s, e) => { if (OpenMainRequested != null) OpenMainRequested(); };
            title.Controls.Add(openMain);
            Controls.Add(view);
            Controls.Add(title);
            UpdateTitle();
            Web.Attach(view, "/overlay.html", true, OnPageMessage);
            ResizeEnd += (s, e) => SaveBounds();
            SizeChanged += (s, e) => RoundCorners();
            RoundCorners();
            Move += (s, e) => { if (Visible && MouseButtons == MouseButtons.None) SaveBounds(); };
        }

        void SaveBounds() { if (WindowState == FormWindowState.Normal) { Config.OverlayBounds = Bounds; Config.Save(); } }

        void OnPageMessage(string m)
        {
            int n;
            if (m == "collapse" && CollapseRequested != null) CollapseRequested();
            else if (m.StartsWith("badge:") && int.TryParse(m.Substring(6), out n) && BadgeChanged != null) BadgeChanged(n);
            else if (m == "hello" && HelloReceived != null) HelloReceived();
            else if (m == "update" && UpdateRequested != null) UpdateRequested();
            else if (m.StartsWith("open:map:") && OpenMapRequested != null) OpenMapRequested(m.Substring(9));
            else if (m == "check" && CheckRequested != null) CheckRequested();
            else if (m == "open:main" && OpenMainRequested != null) OpenMainRequested();
        }

        // Charge la page même si l'overlay reste réduit (pour que la bulle affiche son compteur)
        public void EnsureLoaded()
        {
            if (IsHandleCreated) return;
            double o = Opacity;
            Opacity = 0; Show(); Hide(); Opacity = o;
        }

        void UpdateTitle()
        {
            BackColor = ClickThrough ? Bar : update ? FrameUpdate : Frame;
            title.ForeColor = update ? Color.FromArgb(150, 235, 175) : BarText;
            title.Text = update ? "  ⬆ Mise à jour disponible"
                : ClickThrough ? "  🔒 Clic à travers  ·  Ctrl+Maj+T pour interagir"
                : "  ⠿ Compagnon  ·  Ctrl+Maj+T clic à travers";
        }

        // Montrer l'overlay sans voler le focus au jeu
        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_TOOLWINDOW; return cp; } // absent d'Alt+Tab
        }

        // Bords redimensionnables (la zone de marge autour de l'affichage)
        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            if (m.Msg != WM_NCHITTEST || ClickThrough) return;
            var p = PointToClient(new Point((short)(m.LParam.ToInt64() & 0xFFFF), (short)((m.LParam.ToInt64() >> 16) & 0xFFFF)));
            bool l = p.X < Edge, r = p.X >= ClientSize.Width - Edge, t = p.Y < Edge, b = p.Y >= ClientSize.Height - Edge;
            int hit = t && l ? 13 : t && r ? 14 : b && l ? 16 : b && r ? 17 : l ? 10 : r ? 11 : t ? 12 : b ? 15 : 0;
            if (hit != 0) m.Result = (IntPtr)hit;
        }

        public void SetClickThrough(bool on)
        {
            ClickThrough = on;
            int ex = GetWindowLong(Handle, GWL_EXSTYLE) | WS_EX_LAYERED;
            ex = on ? ex | WS_EX_TRANSPARENT : ex & ~WS_EX_TRANSPARENT;
            SetWindowLong(Handle, GWL_EXSTYLE, ex);
            Opacity = on ? Math.Min(Config.Opacity, 0.8) : Config.Opacity;
            UpdateTitle();
        }

        // Mise à jour disponible : le cadre bleu passe au vert (la page affiche au milieu la fenêtre qui force la mise à jour)
        public void SetUpdate(bool on)
        {
            if (on == update) return;
            update = on;
            UpdateTitle();
        }

        public void ShowOverlay() { if (!Visible) Show(); TopMost = false; TopMost = true; }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
            base.OnFormClosing(e);
        }
    }

    // ---------- Bulle : l'overlay réduit, avec l'emblème d'Enshrouded et le nombre de choses à faire ----------
    class BubbleForm : Form
    {
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        const int WM_NCLBUTTONDOWN = 0xA1, HTCAPTION = 2, WS_EX_TOOLWINDOW = 0x80;
        const int D = 64; // diamètre
        static readonly Color Glow = Color.FromArgb(143, 208, 245); // bleu clair de l'emblème d'Enshrouded
        static readonly Color Green = Color.FromArgb(76, 214, 120);  // mise à jour disponible
        const int LW = 150, LH = 20;      // étiquette « Mise à jour disponible » au-dessus du rond
        int Ox { get { return update ? (LW - D) / 2 : 0; } } // décalage du rond quand l'étiquette élargit la fenêtre
        int Oy { get { return update ? LH + 4 : 0; } }       // … et quand elle se place au-dessus

        readonly ToolTip tip = new ToolTip();
        readonly Bitmap flame;
        int count = -1;
        bool update;                      // mise à jour disponible : la bulle clignote
        Point downAt;
        bool dragging;
        public event Action Clicked;
        readonly Bitmap logo;             // logo du Compagnon (lanterne), intégré à l'exe (ressource « logo.png »)
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer { Interval = 40 };
        readonly Stopwatch clock = Stopwatch.StartNew();

        public BubbleForm()
        {
            Text = Program.AppName + " — bulle";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            ClientSize = new Size(D, D);
            BackColor = Color.FromArgb(20, 17, 26);
            Opacity = 0.95;
            Cursor = Cursors.Hand;
            DoubleBuffered = true;
            UpdateShape();
            anim.Tick += (s, e) => Invalidate();
            VisibleChanged += (s, e) => { if (Visible && logo != null) anim.Start(); else anim.Stop(); };
            flame = Icon.ExtractAssociatedIcon(Application.ExecutablePath).ToBitmap();
            using (var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                if (res != null) logo = new Bitmap(res);
            var area = Screen.PrimaryScreen.WorkingArea;
            Location = (Config.BubblePos.X >= 0 && Screen.AllScreens.Any(s => s.WorkingArea.Contains(Config.BubblePos)))
                ? Config.BubblePos : new Point(area.Right - D - 24, area.Top + 120);
            tip.SetToolTip(this, "Compagnon — clic pour ouvrir, glisser pour déplacer");
        }

        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_TOOLWINDOW; return cp; } }

        public void SetCount(int n)
        {
            if (n == count) return;
            count = n;
            tip.SetToolTip(this, n > 0 ? n + " chose(s) à faire — clic pour ouvrir" : "Compagnon — clic pour ouvrir");
            Invalidate();
        }

        public void ShowBubble() { if (!Visible) Show(); TopMost = false; TopMost = true; }

        public void SetUpdate(bool on)
        {
            if (on == update) return;
            int circleX = Left + Ox, circleY = Top + Oy; // le rond ne bouge pas : seule l'étiquette apparaît au-dessus
            update = on;
            UpdateShape();
            Location = new Point(circleX - Ox, circleY - Oy);
            tip.SetToolTip(this, on ? "Mise à jour disponible — clic pour ouvrir l'overlay et l'installer" : "Compagnon — clic pour ouvrir");
            Invalidate();
        }

        // Forme de la fenêtre : le rond + la pastille du compteur (+ l'étiquette de mise à jour)
        void UpdateShape()
        {
            ClientSize = update ? new Size(LW, D + LH + 4) : new Size(D, D);
            using (var path = new GraphicsPath(FillMode.Winding)) // Winding : les formes s'additionnent
            {
                path.AddEllipse(Ox, Oy, D, D);
                path.AddEllipse(Ox + D - 26, Oy, 26, 26);
                if (update) path.AddRectangle(new Rectangle(0, 0, LW, LH));
                Region = new Region(path);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            using (var bg = new SolidBrush(BackColor)) g.FillRectangle(bg, ClientRectangle);
            if (update)
            {
                // Étiquette discrète au-dessus du rond
                var lr = new Rectangle(0, 0, LW - 1, LH - 1);
                using (var b = new SolidBrush(Color.FromArgb(12, 30, 22))) g.FillRectangle(b, lr);
                using (var pen = new Pen(Green, 1f)) g.DrawRectangle(pen, lr);
                using (var f = new Font("Segoe UI", 8.5f))
                using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                using (var ink = new SolidBrush(Color.FromArgb(200, 245, 215)))
                    g.DrawString("Mise à jour disponible", f, ink, new RectangleF(lr.X, lr.Y, lr.Width, lr.Height), sf);
                g.TranslateTransform(Ox, Oy);
            }
            // Anneau bleu ; s'il y a une mise à jour, il passe au vert et pulse doucement
            double blink = update ? (Math.Sin(clock.Elapsed.TotalSeconds * 2 * Math.PI / 1.6) + 1) / 2 : 0;
            var ring = update ? Color.FromArgb((int)(140 + 115 * blink), Green.R, Green.G, Green.B) : Glow;
            using (var pen = new Pen(ring, update ? 4f : 3f)) g.DrawEllipse(pen, 3.5f, 3.5f, D - 8f, D - 8f);
            if (logo != null)
            {
                // L'emblème « respire » doucement, comme sa lueur dans le jeu
                double t = clock.Elapsed.TotalSeconds;
                float scale = 1f + (float)(Math.Sin(t * 2 * Math.PI / 3.0) * 0.04);
                const float S = 50f;
                var state = g.Save();
                g.TranslateTransform(D / 2f, D / 2f);
                g.ScaleTransform(scale, scale);
                using (var clip = new GraphicsPath()) { clip.AddEllipse(-D / 2f + 5, -D / 2f + 5, D - 10, D - 10); g.SetClip(clip); }
                g.DrawImage(logo, -S / 2, -S / 2, S, S);
                g.Restore(state);
                if (count > 0)
                {
                    // Pastille bleue avec le nombre de choses à faire
                    string t2 = count > 99 ? "99+" : count.ToString();
                    var r = new RectangleF(D - 25, 1, 24, 24);
                    using (var b = new SolidBrush(Glow)) g.FillEllipse(b, r);
                    using (var pen = new Pen(Color.FromArgb(20, 17, 26), 2f)) g.DrawEllipse(pen, r);
                    using (var f = new Font("Segoe UI", t2.Length == 1 ? 10f : 8f, FontStyle.Bold))
                    using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                        using (var ink = new SolidBrush(Color.FromArgb(13, 27, 38)))
                            g.DrawString(t2, f, ink, new RectangleF(r.X, r.Y + 1, r.Width, r.Height), sf);
                }
                return;
            }
            if (count > 0)
            {
                string t = count > 99 ? "99+" : count.ToString();
                float size = t.Length == 1 ? 18f : t.Length == 2 ? 15f : 12f;
                using (var f = new Font("Segoe UI Semibold", size, FontStyle.Bold))
                using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                    g.DrawString(t, f, Brushes.White, new RectangleF(0, 1, D, D), sf);
            }
            else g.DrawImage(flame, (D - 28) / 2, (D - 28) / 2, 28, 28);
        }

        // Clic = ouvrir ; glisser = déplacer (la position est retenue)
        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left) { downAt = Cursor.Position; dragging = false; }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (e.Button != MouseButtons.Left || dragging) return;
            var p = Cursor.Position;
            if (Math.Abs(p.X - downAt.X) + Math.Abs(p.Y - downAt.Y) < 5) return;
            dragging = true;
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero); // rend la main une fois la bulle lâchée
            Config.BubblePos = new Point(Left + Ox, Top + Oy);
            Config.Save();
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (e.Button == MouseButtons.Left && !dragging && Clicked != null) Clicked();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
            base.OnFormClosing(e);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { anim.Dispose(); if (logo != null) logo.Dispose(); }
            base.Dispose(disposing);
        }
    }

    // ---------- Sauvegarde du personnage (lecture seule) ----------
    // Le jeu enregistre le personnage dans Steam\userdata\<compte>\1203620\remote\character*.ksd.
    // On lit le plus récent (sans jamais l'écrire, en partageant l'accès avec le jeu) et on l'envoie aux pages,
    // qui le décodent (savegame.js) : niveau, compétences prises.
    class SaveWatcher : IDisposable
    {
        readonly List<FileSystemWatcher> watchers = new List<FileSystemWatcher>();
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 2000 };
        volatile bool dirty;
        DateTime changedAt, lastCheck = DateTime.MinValue;
        string signature;
        public string Json { get; private set; }
        public event Action Updated;

        public SaveWatcher()
        {
            foreach (var dir in Directories())
            {
                try
                {
                    var w = new FileSystemWatcher(dir, "character*.ksd") { NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size };
                    FileSystemEventHandler h = (s, e) => { changedAt = DateTime.Now; dirty = true; };
                    w.Changed += h; w.Created += h; w.Deleted += h; w.Renamed += (s, e) => { changedAt = DateTime.Now; dirty = true; };
                    w.EnableRaisingEvents = true;
                    watchers.Add(w);
                }
                catch { }
            }
            // Attend 2 s après la dernière écriture du jeu ; vérifie aussi chaque minute au cas où
            timer.Tick += (s, e) =>
            {
                if ((dirty && (DateTime.Now - changedAt).TotalSeconds >= 2) || (DateTime.Now - lastCheck).TotalSeconds >= 60) { dirty = false; Load(); }
            };
            timer.Start();
            Load();
        }

        // Dossiers des sauvegardes : celui choisi dans les Paramètres, sinon ceux de chaque compte Steam du PC
        public static IEnumerable<string> Directories()
        {
            if (!string.IsNullOrEmpty(Config.SaveDir) && Directory.Exists(Config.SaveDir)) { yield return Config.SaveDir; yield break; }
            string steam = null;
            try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam")) if (k != null) steam = k.GetValue("SteamPath") as string; } catch { }
            if (string.IsNullOrEmpty(steam)) steam = @"C:\Program Files (x86)\Steam";
            string userdata = Path.Combine(steam.Replace('/', '\\'), "userdata");
            if (!Directory.Exists(userdata)) yield break;
            foreach (var u in Directory.GetDirectories(userdata))
            {
                string remote = Path.Combine(u, "1203620", "remote");
                if (Directory.Exists(remote)) yield return remote;
            }
        }

        static long Ms(DateTime utc) { return (long)(utc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds; }

        // Lit (sans jamais les modifier) toutes les sauvegardes de personnages ; « latest » = celle que le jeu vient d'écrire
        public void Load()
        {
            lastCheck = DateTime.Now;
            try
            {
                var files = new List<FileInfo>();
                foreach (var d in Directories()) files.AddRange(new DirectoryInfo(d).GetFiles("character*.ksd"));
                string sig = string.Join("|", files.Select(f => f.FullName + ":" + f.LastWriteTimeUtc.Ticks + ":" + f.Length));
                if (sig == signature) return;
                var list = new List<Dictionary<string, object>>();
                FileInfo latest = null;
                foreach (var f in files)
                {
                    byte[] data;
                    using (var fs = new FileStream(f.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    {
                        data = new byte[fs.Length];
                        int o = 0, n;
                        while (o < data.Length && (n = fs.Read(data, o, data.Length - o)) > 0) o += n;
                    }
                    if (data.Length < 64 || data[0] != (byte)'S' || data[1] != (byte)'V' || data[2] != (byte)'2' || data[3] != (byte)'C') continue;
                    // Identifiant stable : compte Steam (dossier) + fichier
                    string user = Path.GetFileName(Path.GetDirectoryName(Path.GetDirectoryName(f.DirectoryName) ?? "") ?? "");
                    list.Add(new Dictionary<string, object> { { "id", (user.Length > 0 ? user + "/" : "") + f.Name }, { "file", f.Name }, { "mtime", Ms(f.LastWriteTimeUtc) }, { "data", Convert.ToBase64String(data) } });
                    if (latest == null || f.LastWriteTimeUtc > latest.LastWriteTimeUtc) latest = f;
                }
                signature = sig;
                Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Serialize(new Dictionary<string, object> {
                    { "type", "saves" }, { "list", list }, { "dirs", Directories().ToArray() } });
                if (Updated != null) Updated();
            }
            catch { /* fichier en cours d'écriture : on réessaiera */ }
        }

        public void Dispose()
        {
            timer.Dispose();
            foreach (var w in watchers) w.Dispose();
        }
    }

    // ---------- Raccourcis clavier globaux (fonctionnent même en jeu) ----------
    class HotKeys : NativeWindow, IDisposable
    {
        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
        const uint MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_NOREPEAT = 0x4000;
        readonly Dictionary<int, Action> actions = new Dictionary<int, Action>();
        public readonly List<string> Failed = new List<string>();

        public HotKeys() { CreateHandle(new CreateParams()); }

        public void Add(int id, Keys key, string label, Action action)
        {
            if (RegisterHotKey(Handle, id, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, (uint)key)) actions[id] = action;
            else Failed.Add(label);
        }

        protected override void WndProc(ref Message m)
        {
            Action a;
            if (m.Msg == 0x0312 && actions.TryGetValue(m.WParam.ToInt32(), out a)) a();
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            foreach (var id in actions.Keys) UnregisterHotKey(Handle, id);
            DestroyHandle();
        }
    }

    // ---------- L'appli dans la zone de notification ----------
    class TrayApp : ApplicationContext
    {
        readonly NotifyIcon tray;
        readonly HotKeys hotkeys;
        SaveWatcher saves;
        readonly System.Windows.Forms.Timer gameTimer, updateTimer;
        readonly ToolStripMenuItem miClickThrough, miWithGame, miAutoStart, miUpdate;
        readonly Control ui; // pour revenir sur le fil de l'interface
        MainForm main;
        OverlayForm overlay;
        BubbleForm bubble;
        int badge = -1;
        bool gameRunning;
        Installer.UpdateInfo pendingUpdate;
        bool updateAsked;

        public TrayApp(bool startHidden)
        {
            ui = new Control(); ui.CreateControl();
            var menu = new ContextMenuStrip();
            menu.Items.Add("Ouvrir le Compagnon", null, (s, e) => ShowMain()).Font = new Font(menu.Font, FontStyle.Bold);
            menu.Items.Add("Afficher / masquer l'overlay   (Ctrl+Maj+E)", null, (s, e) => ToggleOverlay());
            menu.Items.Add("Réduire en bulle / agrandir l'overlay", null, (s, e) => { if (Config.Collapsed) Expand(); else Collapse(); });
            miClickThrough = new ToolStripMenuItem("Overlay : clic à travers   (Ctrl+Maj+T)", null, (s, e) => ToggleClickThrough());
            menu.Items.Add(miClickThrough);
            menu.Items.Add(new ToolStripSeparator());
            miWithGame = new ToolStripMenuItem("Afficher l'overlay quand Enshrouded se lance", null, (s, e) => { Config.ShowWithGame = !Config.ShowWithGame; Config.Save(); RefreshMenu(); });
            miAutoStart = new ToolStripMenuItem("Se lancer tout seul avec Enshrouded", null, (s, e) => { Installer.SetAutoStart(!Installer.AutoStart, Application.ExecutablePath); RefreshMenu(); });
            menu.Items.Add(miWithGame);
            menu.Items.Add(miAutoStart);
            var opacity = new ToolStripMenuItem("Transparence de l'overlay");
            foreach (var o in new[] { 1.0, 0.92, 0.8, 0.65 })
            {
                double val = o;
                opacity.DropDownItems.Add(new ToolStripMenuItem((int)Math.Round(val * 100) + " %", null, (s, e) => { Config.Opacity = val; Config.Save(); if (overlay != null && !overlay.ClickThrough) overlay.Opacity = val; }));
            }
            menu.Items.Add(opacity);
            menu.Items.Add(new ToolStripSeparator());
            miUpdate = new ToolStripMenuItem("Installer la mise à jour", null, (s, e) => InstallUpdate()) { Visible = false, Font = new Font(menu.Font, FontStyle.Bold) };
            menu.Items.Add(miUpdate);
            menu.Items.Add("Rechercher une mise à jour", null, (s, e) => CheckUpdate(true));
            if (Installer.IsInstalled) menu.Items.Add("Désinstaller…", null, (s, e) => Uninstall());
            menu.Items.Add("Quitter", null, (s, e) => Quit());
            menu.Opening += (s, e) => RefreshMenu();

            tray = new NotifyIcon
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath),
                Text = Program.AppName + " " + Program.CurrentVersion.ToString(3),
                ContextMenuStrip = menu,
                Visible = true
            };
            tray.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) ShowMain(); };
            tray.BalloonTipClicked += (s, e) => { if (pendingUpdate != null) InstallUpdate(); };

            hotkeys = new HotKeys();
            hotkeys.Add(1, Keys.E, "Ctrl+Maj+E", ToggleOverlay);
            hotkeys.Add(2, Keys.T, "Ctrl+Maj+T", ToggleClickThrough);
            hotkeys.Add(3, Keys.C, "Ctrl+Maj+C", ShowMain);
            if (hotkeys.Failed.Count > 0)
                tray.ShowBalloonTip(5000, Program.AppName, "Raccourci déjà utilisé par un autre logiciel : " + string.Join(", ", hotkeys.Failed), ToolTipIcon.Warning);

            // Une autre instance demande d'afficher la fenêtre
            ThreadPool.RegisterWaitForSingleObject(Program.ShowSignal, (st, to) => ui.BeginInvoke((Action)ShowMain), null, -1, false);

            gameTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            gameTimer.Tick += (s, e) => CheckGame();
            gameTimer.Start();

            saves = new SaveWatcher();
            saves.Updated += BroadcastSave;
            Web.Message += OnPageRequest;

            updateTimer = new System.Windows.Forms.Timer { Interval = 5 * 60 * 1000 }; // toutes les 5 minutes (petit fichier)
            updateTimer.Tick += (s, e) => CheckUpdate(false);
            updateTimer.Start();
            var first = new System.Windows.Forms.Timer { Interval = 15000 };
            first.Tick += (s, e) => { first.Stop(); first.Dispose(); CheckUpdate(false); };
            first.Start();

            if (!startHidden) ShowMain();
            else if (!GameRunning()) Sleep();
        }

        void RefreshMenu()
        {
            miClickThrough.Checked = overlay != null && overlay.ClickThrough;
            miWithGame.Checked = Config.ShowWithGame;
            miAutoStart.Checked = Installer.AutoStart;
        }

        // Ouvre la fenêtre du Compagnon sur la grande carte d'une ressource. Si la page n'est pas encore chargée,
        // le message attend son « hello » (sinon il serait perdu).
        bool mainReady;
        string pendingOpen;
        void OpenMap(string name)
        {
            var json = new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "type", "open" }, { "map", name } });
            bool ready = main != null && !main.IsDisposed && mainReady;
            ShowMain();
            if (ready) main.Post(json); else pendingOpen = json;
        }

        // ----- Veille : tant qu'Enshrouded n'est pas lancé, le Compagnon dort -----
        // Lancé avec Windows, il ne fait que regarder toutes les 3 secondes si le jeu tourne : pas de fenêtre, pas d'icône,
        // pas de réseau, pas de moteur web (quelques Mo de mémoire). Le jeu démarre → il se réveille ; le jeu se ferme → il se rendort.
        bool asleep;
        [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(IntPtr h);

        void Sleep()
        {
            if (asleep || !Installer.AutoStart) return;   // sans « se lancer avec Enshrouded », l'appli reste dans la zone de notification
            if (main != null && !main.IsDisposed && main.Visible) return;
            asleep = true;
            updateTimer.Stop();
            tray.Visible = false;
            if (overlay != null) { overlay.Dispose(); overlay = null; }
            if (bubble != null) { bubble.Dispose(); bubble = null; }
            if (main != null) { main.Dispose(); main = null; }
            GC.Collect(); GC.WaitForPendingFinalizers();
            try { EmptyWorkingSet(Process.GetCurrentProcess().Handle); } catch { }
        }

        void Wake()
        {
            if (!asleep) return;
            asleep = false;
            tray.Visible = true;
            updateTimer.Start();
            CheckUpdate(false);
        }

        void ShowMain()
        {
            Wake();
            if (main == null || main.IsDisposed)
            {
                main = new MainForm();
                mainReady = false;
                main.HelloReceived += BroadcastStatus;
                main.HelloReceived += () => { mainReady = true; if (pendingOpen != null) { main.Post(pendingOpen); pendingOpen = null; } };
                main.UpdateRequested += InstallFromPage;
                // Fenêtre fermée et jeu éteint : le Compagnon se rendort (après la fermeture, pas pendant)
                main.VisibleChanged += (s, e) => { if (!((Form)s).Visible && !gameRunning) ui.BeginInvoke((Action)Sleep); };
            }
            main.Show();
            if (main.WindowState == FormWindowState.Minimized) main.WindowState = FormWindowState.Normal;
            main.Activate();
        }

        OverlayForm Overlay
        {
            get
            {
                if (overlay == null || overlay.IsDisposed)
                {
                    overlay = new OverlayForm();
                    overlay.CollapseRequested += Collapse;
                    overlay.BadgeChanged += n => { badge = n; if (bubble != null) bubble.SetCount(n); };
                    overlay.HelloReceived += BroadcastStatus;
                    overlay.UpdateRequested += InstallFromPage;
                    overlay.OpenMapRequested += OpenMap;
                    overlay.OpenMainRequested += ShowMain;
                    overlay.SetUpdate(pendingUpdate != null);
                    overlay.CheckRequested += () => { if (pendingUpdate == null) CheckUpdate(false); };
                }
                return overlay;
            }
        }

        BubbleForm Bubble
        {
            get
            {
                if (bubble == null || bubble.IsDisposed) { bubble = new BubbleForm(); bubble.Clicked += Expand; bubble.SetCount(badge); bubble.SetUpdate(pendingUpdate != null); }
                return bubble;
            }
        }

        bool PanelVisible { get { return (overlay != null && overlay.Visible) || (bubble != null && bubble.Visible); } }

        // Affiche l'overlay tel qu'on l'a laissé : en grand ou réduit en bulle
        void ShowPanel()
        {
            if (Config.Collapsed) { Overlay.EnsureLoaded(); Bubble.ShowBubble(); }
            else { if (bubble != null) bubble.Hide(); Overlay.ShowOverlay(); }
        }

        void HidePanel()
        {
            if (overlay != null) overlay.Hide();
            if (bubble != null) bubble.Hide();
        }

        void Collapse()
        {
            Config.Collapsed = true; Config.Save();
            if (overlay != null) overlay.Hide();
            Overlay.EnsureLoaded();
            Bubble.ShowBubble();
        }

        void Expand()
        {
            Config.Collapsed = false; Config.Save();
            if (bubble != null) bubble.Hide();
            Overlay.ShowOverlay();
        }

        void ToggleOverlay() { if (PanelVisible) HidePanel(); else { Wake(); ShowPanel(); } }

        void ToggleClickThrough()
        {
            Wake();
            if (Config.Collapsed || !Overlay.Visible) Expand();
            overlay.SetClickThrough(!overlay.ClickThrough);
        }

        // Détection du jeu : le processus « enshrouded.exe »
        public static bool GameRunning()
        {
            var procs = Process.GetProcessesByName("enshrouded");
            foreach (var p in procs) p.Dispose();
            return procs.Length > 0;
        }

        void CheckGame()
        {
            bool running = GameRunning();
            if (running == gameRunning) return;
            gameRunning = running;
            if (running)
            {
                Wake();
                if (Config.ShowWithGame) ShowPanel();
            }
            else { HidePanel(); Sleep(); }
        }

        // Informe les pages (menu de l'appli, overlay) et la bulle : version actuelle et mise à jour disponible
        void BroadcastStatus()
        {
            var json = new JavaScriptSerializer().Serialize(new Dictionary<string, object> {
                { "type", "app" }, { "version", Program.CurrentVersion.ToString(3) },
                { "update", pendingUpdate != null ? pendingUpdate.version : null },
                { "notes", pendingUpdate != null ? pendingUpdate.notes : null },
                { "highlights", pendingUpdate != null ? pendingUpdate.highlights : null },
                { "pages", pendingUpdate != null && Installer.PagesOnly(pendingUpdate) } });
            if (main != null && !main.IsDisposed) main.Post(json);
            if (overlay != null && !overlay.IsDisposed) { overlay.Post(json); overlay.SetUpdate(pendingUpdate != null); }
            if (bubble != null && !bubble.IsDisposed) bubble.SetUpdate(pendingUpdate != null);
            BroadcastSave(); // une page qui vient de s'ouvrir reçoit aussi la dernière sauvegarde
        }

        // Demandes des pages : relais réseau (actualités Steam, traduction), récupération des données du serveur,
        // choix du dossier des sauvegardes. La réponse repart vers la page qui a demandé.
        static readonly string[] FetchHosts = { "api.steampowered.com", "translate.googleapis.com" };
        void OnPageRequest(WebView2 view, string m)
        {
            var js = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            Action<Dictionary<string, object>> reply = d => ui.BeginInvoke((Action)(() => Web.Post(view, js.Serialize(d))));
            if (m.StartsWith("fetch:"))
            {
                Dictionary<string, object> q;
                try { q = js.Deserialize<Dictionary<string, object>>(m.Substring(6)); } catch { return; }
                object o;
                string id = q.TryGetValue("id", out o) ? Convert.ToString(o) : "", url = q.TryGetValue("url", out o) ? Convert.ToString(o) : "";
                string method = q.TryGetValue("method", out o) && o != null ? Convert.ToString(o) : "GET", body = q.TryGetValue("body", out o) && o != null ? Convert.ToString(o) : null;
                Uri u;
                if (!Uri.TryCreate(url, UriKind.Absolute, out u) || u.Scheme != "https" || !FetchHosts.Contains(u.Host))
                { reply(new Dictionary<string, object> { { "type", "fetch" }, { "id", id }, { "ok", false } }); return; }
                Task.Run(() =>
                {
                    using (var wc = new WebClient())
                    {
                        wc.Encoding = System.Text.Encoding.UTF8;
                        if (body == null) return wc.DownloadString(u);
                        wc.Headers[HttpRequestHeader.ContentType] = "application/x-www-form-urlencoded";
                        return wc.UploadString(u, method, body);
                    }
                }).ContinueWith(t => reply(new Dictionary<string, object> { { "type", "fetch" }, { "id", id }, { "ok", !t.IsFaulted }, { "text", t.IsFaulted ? null : t.Result } }));
            }
            else if (m == "migrate") reply(new Dictionary<string, object> { { "type", "migrate" }, { "ok", false } });
            else if (m == "pickSaveDir")
            {
                using (var dlg = new FolderBrowserDialog { Description = "Dossier des sauvegardes d'Enshrouded (celui qui contient les fichiers character…ksd)", ShowNewFolderButton = false })
                {
                    if (!string.IsNullOrEmpty(Config.SaveDir)) dlg.SelectedPath = Config.SaveDir;
                    if (dlg.ShowDialog() != DialogResult.OK) return;
                    Config.SaveDir = dlg.SelectedPath; Config.Save();
                }
                RestartSaves();
            }
            else if (m == "autoSaveDir") { Config.SaveDir = ""; Config.Save(); RestartSaves(); }
        }

        void RestartSaves()
        {
            saves.Dispose();
            saves = new SaveWatcher();
            saves.Updated += BroadcastSave;
            BroadcastSave();
        }


        void BroadcastSave()
        {
            if (saves == null || saves.Json == null) return;
            if (main != null && !main.IsDisposed) main.Post(saves.Json);
            if (overlay != null && !overlay.IsDisposed) overlay.Post(saves.Json);
        }

        // Bouton « Installer la mise à jour » cliqué dans une page
        void InstallFromPage() { if (pendingUpdate != null) InstallUpdate(); else CheckUpdate(true); }

        async void CheckUpdate(bool manual)
        {
            if (asleep) return; // en veille : aucun accès réseau
            Installer.UpdateInfo info = null;
            try { info = await Task.Run(() => Installer.CheckUpdate()); }
            catch (Exception ex) { if (manual) MessageBox.Show("Impossible de vérifier les mises à jour : " + ex.Message, Program.AppName); return; }
            if (info == null) { if (manual) MessageBox.Show("Tu as déjà la dernière version (" + Program.CurrentVersion.ToString(3) + ").", Program.AppName); return; }
            pendingUpdate = info;
            miUpdate.Text = "⬆ Installer la mise à jour " + info.version;
            miUpdate.Visible = true;
            BroadcastStatus();
            if (!manual)
            {
                // En automatique : simple notification, le bouton clignotant de l'appli et de l'overlay fait le reste
                if (!updateAsked) tray.ShowBalloonTip(5000, Program.AppName, "Mise à jour " + info.version + " disponible : clique sur le bouton qui clignote pour l'installer.", ToolTipIcon.Info);
                updateAsked = true;
            }
            else
            {
                updateAsked = true;
                var r = MessageBox.Show("Une nouvelle version du Compagnon est disponible : " + info.version +
                    (string.IsNullOrEmpty(info.notes) ? "" : "\n\n" + info.notes) + "\n\nMettre à jour maintenant ?",
                    Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                if (r == DialogResult.Yes) InstallUpdate();
            }
        }

        async void InstallUpdate()
        {
            if (pendingUpdate == null) return;
            var info = pendingUpdate;
            try
            {
                bool showMain = main != null && !main.IsDisposed && main.Visible;
                bool full = await Task.Run(() => Installer.ApplyUpdate(info, showMain, pct => {
                    if (ui.IsHandleCreated && !ui.IsDisposed) ui.BeginInvoke(new Action(() => {
                        var j = new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "type", "updprogress" }, { "pct", pct } });
                        if (main != null && !main.IsDisposed) main.Post(j);
                        if (overlay != null && !overlay.IsDisposed) overlay.Post(j);
                    }));
                }));
                if (!full)
                {
                    pendingUpdate = null;
                    miUpdate.Visible = false;
                    if (main != null && !main.IsDisposed) Web.Remap(main.View);
                    if (overlay != null && !overlay.IsDisposed) Web.Remap(overlay.View);
                    BroadcastStatus();
                }
                else Quit();
            }
            catch (Exception ex) { MessageBox.Show("La mise à jour a échoué : " + ex.Message, Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }


        void Uninstall()
        {
            if (MessageBox.Show("Désinstaller le Compagnon de ce PC ?\n(Tes données restent sur le serveur de la maison.)", Program.AppName,
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            Installer.Uninstall();
            Quit();
        }

        void Quit()
        {
            gameTimer.Stop(); updateTimer.Stop();
            hotkeys.Dispose();
            saves.Dispose();
            tray.Visible = false; tray.Dispose();
            if (overlay != null) overlay.Dispose();
            if (bubble != null) bubble.Dispose();
            if (main != null) main.Dispose();
            ExitThread();
        }
    }

}
