# Reports where other programs' windows are, so the pet can stand on them.
# Prints one JSON line whenever something changes, front-most window first:
#   [[handle, left, top, right, bottom], ...]   in physical screen pixels.
# Started by main.mjs; exits on its own when the pet (ParentPid) is gone.
param([long]$Self = 0, [int]$ParentPid = 0, [int]$IntervalMs = 150)

$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PetWindows {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

  // Desktop, taskbar and other shell surfaces aren't windows she can stand on.
  static readonly string[] Shell = { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };

  public static void Init() {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } // real pixels, not scaled ones
  }

  static string Json(string s) {
    var sb = new StringBuilder("\"");
    foreach (char c in s) {
      if (c == '"' || c == '\\') sb.Append('\\').Append(c);
      else if (c < ' ') sb.Append(' ');
      else sb.Append(c);
    }
    return sb.Append('"').ToString();
  }

  // The program in front: {"proc":"chrome","title":"..."}. The pet only sorts it
  // into a kind of activity on this computer; nothing is stored or sent anywhere.
  public static string Foreground(long self) {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || (long)h == self) return "";
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    string proc = "";
    try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    var t = new StringBuilder(256);
    GetWindowText(h, t, 256);
    return "{\"proc\":" + Json(proc) + ",\"title\":" + Json(t.ToString()) + "}";
  }

  public static string Snapshot(long self) {
    var sb = new StringBuilder("[");
    bool first = true;
    var cls = new StringBuilder(64);
    EnumWindows((h, l) => {
      if ((long)h == self || !IsWindowVisible(h) || IsIconic(h)) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true; // tool windows (tooltips, palettes)
      if (GetWindowTextLength(h) == 0) return true;
      cls.Clear();
      GetClassName(h, cls, 64);
      if (Array.IndexOf(Shell, cls.ToString()) >= 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true; // on another virtual desktop etc.
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true; // visible frame, without the invisible resize border
      if (r.R - r.L < 120 || r.B - r.T < 60) return true;
      if (!first) sb.Append(',');
      first = false;
      sb.Append('[').Append((long)h).Append(',').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append(']');
      return true;
    }, IntPtr.Zero);
    return sb.Append(']').ToString();
  }
}
"@

[PetWindows]::Init()
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$last = ""
$lastFg = ""
while ($true) {
  if ($ParentPid -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
  $now = [PetWindows]::Snapshot($Self)
  if ($now -ne $last) {
    [Console]::Out.WriteLine($now)
    [Console]::Out.Flush()
    $last = $now
  }
  $fg = [PetWindows]::Foreground($Self)
  if ($fg -and $fg -ne $lastFg) {
    [Console]::Out.WriteLine($fg)
    [Console]::Out.Flush()
    $lastFg = $fg
  }
  Start-Sleep -Milliseconds $IntervalMs
}
