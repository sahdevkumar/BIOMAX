import React, { useState, useEffect, useRef } from "react";
import { 
  Activity, 
  Database, 
  Cpu, 
  RefreshCw, 
  Users, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Settings, 
  ChevronRight,
  ShieldCheck,
  Calendar,
  History,
  Terminal,
  Plus,
  Trash2,
  Cloud,
  CloudOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---
interface Device {
  Id: number;
  Name: string;
  DeviceKey: string;
  IpAddress: string;
  Vendor: string;
  TimeZone: string;
  DirectionType: string;
  LocationId: number;
  Location: string;
}

interface SyncLog {
  id: string;
  time: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

// --- Supabase Helpers ---
const SB_URL = "https://eftrwmyefqnerqdgidbm.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdHJ3bXllZnFuZXJxZGdpZGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjE0MzQsImV4cCI6MjA4MzI5NzQzNH0.7511O0CKAeZXQGk0AgNAf7WEgBliWcrUd551DR-nWpE";
const BIOMAX_USER = "rishav";
const BIOMAX_PASS =  "admin";

function getSbHeaders() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbUpsert(table: string, data: any[], onConflict: string) {
  if (!SB_URL || !SB_KEY) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...getSbHeaders(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase Error: ${await res.text()}`);
}

async function sbInsert(table: string, data: any) {
  if (!SB_URL || !SB_KEY) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: getSbHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase Error: ${await res.text()}`);
}

// --- Main Component ---
export default function App() {
  const [isConfigured, setIsConfigured] = useState(!!SB_URL && !!SB_KEY);
  const [token, setToken] = useState<string>("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [newDeviceKey, setNewDeviceKey] = useState("");
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState({ total: 0, lastSync: "Never", devices: 0 });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"sync" | "history">("sync");
  const [isSyncingUsers, setIsSyncingUsers] = useState(false);
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(true);
  const [isSbConnected, setIsSbConnected] = useState<boolean | null>(null);
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);
  const lastSyncedTimes = useRef<Record<string, string>>({});
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [syncLogs]);

  useEffect(() => {
    if (isConfigured && !token) {
      login();
      checkSbConnection();
    }
  }, [isConfigured]);

  const checkSbConnection = async () => {
    try {
      if (!SB_URL || !SB_KEY) {
        setIsSbConnected(false);
        return;
      }
      const res = await fetch(`${SB_URL}/rest/v1/`, {
        headers: getSbHeaders(),
      });
      setIsSbConnected(res.ok);
    } catch (err) {
      console.error("Supabase connection check failed", err);
      setIsSbConnected(false);
    }
  };

  const addLog = (message: string, type: SyncLog["type"] = "info") => {
    setSyncLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        message,
        type,
      },
    ]);
  };

  useEffect(() => {
    if (token) {
      fetchSavedDevices();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchSavedDevices();
      fetchStats();
      fetchRecentLogs();
    }
  }, [token]);

  const fetchStats = async () => {
    try {
      if (!SB_URL || !SB_KEY) return;
      // Get total logs count
      const resLogs = await fetch(`${SB_URL}/rest/v1/biomax_attendance_logs?select=count`, {
        headers: { ...getSbHeaders(), Prefer: "count=exact" },
      });
      const range = resLogs.headers.get("content-range");
      const count = range ? parseInt(range.split("/")[1]) : 0;

      setStats(prev => ({ 
        ...prev, 
        total: count,
        devices: savedDevices.length 
      }));
    } catch (err) {
      console.error("Stats fetch failed", err);
    }
  };

  const fetchRecentLogs = async () => {
    try {
      if (!SB_URL || !SB_KEY) return;
      const res = await fetch(`${SB_URL}/rest/v1/biomax_attendance_logs?order=io_time.desc&limit=50`, {
        headers: getSbHeaders(),
      });
      const data = await res.json();
      setRecentLogs(data);
    } catch (err) {
      console.error("Recent logs fetch failed", err);
    }
  };

  const syncUsers = async () => {
    if (!selectedDevice || !token) return;
    setIsSyncingUsers(true);
    addLog(`Fetching users for ${selectedDevice.Name}...`, "info");
    
    try {
      const res = await fetch(`/api/biomax/User/GetAllUsersByDevice?DeviceKey=${selectedDevice.DeviceKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch users: ${await res.text()}`);
      
      const users = await res.json();
      if (Array.isArray(users) && users.length > 0) {
        addLog(`Found ${users.length} users. Syncing to database...`, "info");
        const sbUsers = users.map((u: any) => ({
          device_key: selectedDevice.DeviceKey,
          user_id: u.UserId,
          user_name: u.UserName,
          emp_code: u.EmpCode,
          card_no: u.CardNo,
          privilege: u.Privilege
        }));
        
        await sbUpsert("biomax_users", sbUsers, "device_key,user_id");
        addLog(`Successfully synced ${users.length} users!`, "success");
      } else {
        addLog("No users found on device", "warning");
      }
    } catch (err: any) {
      addLog(`User sync failed: ${err.message}`, "error");
    } finally {
      setIsSyncingUsers(false);
    }
  };

  const fetchSavedDevices = async () => {
    try {
      if (!SB_URL || !SB_KEY) {
        addLog("Supabase URL or Key is missing in environment", "error");
        return;
      }
      const res = await fetch(`${SB_URL}/rest/v1/biomax_devices`, {
        headers: getSbHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to fetch saved devices");
      }
      const data = await res.json();
      setSavedDevices(data);
      addLog(`Loaded ${data.length} saved devices from database`, "info");
    } catch (err: any) {
      addLog(`Failed to load saved devices: ${err.message}`, "error");
    }
  };

  const saveDeviceByKey = async () => {
    if (!newDeviceKey || !token) return;
    setIsAddingDevice(true);
    addLog(`Searching for device with key: ${newDeviceKey}...`, "info");
    
    try {
      // 1. Fetch all devices from Biomax to find the one with this key
      const res = await fetch("/api/biomax/Device", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allDevices: Device[] = await res.json();
      const found = allDevices.find(d => d.DeviceKey === newDeviceKey);

      if (!found) {
        throw new Error("Device not found in Biomax API with this key");
      }

      // 2. Save to Supabase
      addLog(`Found device: ${found.Name}. Saving to database...`, "info");
      await sbUpsert("biomax_devices", [{
        name: found.Name,
        device_key: found.DeviceKey,
        ip_address: found.IpAddress,
        location: found.Location,
        vendor: found.Vendor
      }], "device_key");

      addLog("Device saved successfully!", "success");
      setNewDeviceKey("");
      fetchSavedDevices();
    } catch (err: any) {
      addLog(`Failed to add device: ${err.message}`, "error");
    } finally {
      setIsAddingDevice(false);
    }
  };

  const removeDevice = async (deviceKey: string) => {
    try {
      if (!SB_URL || !SB_KEY) return;
      const res = await fetch(`${SB_URL}/rest/v1/biomax_devices?device_key=eq.${deviceKey}`, {
        method: "DELETE",
        headers: getSbHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete device");
      addLog("Device removed from database", "success");
      if (selectedDevice?.DeviceKey === deviceKey) setSelectedDevice(null);
      fetchSavedDevices();
    } catch (err: any) {
      addLog(`Delete failed: ${err.message}`, "error");
    }
  };

  const login = async (retryCount = 0) => {
    try {
      addLog("Authenticating with Biomax API...", "info");
      const res = await fetch("/api/biomax/Auth/Login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Username: BIOMAX_USER, Password: BIOMAX_PASS }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Auth failed (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      if (data.Token) {
        setToken(data.Token);
        addLog("Authentication successful", "success");
        fetchDevices(data.Token);
      } else {
        throw new Error("Invalid credentials or proxy error");
      }
    } catch (err: any) {
      addLog(`Login failed: ${err.message}`, "error");
      if (retryCount < 5) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        addLog(`Retrying in ${delay/1000}s... (Attempt ${retryCount + 1}/5)`, "warning");
        setTimeout(() => login(retryCount + 1), delay);
      }
    }
  };

  const fetchDevices = async (authToken: string) => {
    try {
      addLog("Fetching device list...", "info");
      const res = await fetch("/api/biomax/Device", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
      addLog(`Found ${data.length} devices`, "success");
    } catch (err: any) {
      addLog(`Failed to fetch devices: ${err.message}`, "error");
    }
  };

  useEffect(() => {
    let interval: any;
    if (isRealtimeEnabled && token && savedDevices.length > 0) {
      addLog("Real-time sync active. Polling every 30 seconds...", "info");
      interval = setInterval(() => {
        syncAllDevices();
      }, 30000); // 30 seconds
    }
    return () => clearInterval(interval);
  }, [isRealtimeEnabled, token, savedDevices]);

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        addLog("Notification permission granted", "success");
      }
    }
  };

  const showNotification = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { 
        body,
        icon: "https://picsum.photos/seed/attendance/128/128"
      });
    }
  };

  const syncAllDevices = async () => {
    if (!token || savedDevices.length === 0) return;
    
    // Use current date for real-time
    const today = new Date().toISOString().split("T")[0];
    
    for (const dev of savedDevices) {
      const deviceObj = {
        ...dev,
        DeviceKey: dev.device_key || dev.DeviceKey,
        Name: dev.name || dev.Name,
        IpAddress: dev.ip_address || dev.IpAddress
      } as any;
      
      await performSync(deviceObj, today, today, true);
    }
  };

  const performSync = async (device: Device, from: string, to: string, isAuto = false) => {
    if (!token) return;
    if (!isAuto) setIsSyncing(true);
    
    const prefix = isAuto ? "[Auto-Sync] " : "";
    addLog(`${prefix}Checking ${device.Name}...`, "info");

    try {
      // 1. Download Logs
      const res2 = await fetch(`/api/biomax/DeviceCommand/DownloadLogsByDate?FromDate=${from}&ToDate=${to}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([device.DeviceKey]),
      });
      if (!res2.ok) throw new Error(`Download failed: ${await res2.text()}`);

      await new Promise(r => setTimeout(r, 2000));

      // 2. Get Logs
      const logsRes = await fetch(`/api/biomax/DeviceLog/GetAllLogsByDate?FromDate=${from}&ToDate=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!logsRes.ok) throw new Error(`Fetch failed: ${await logsRes.text()}`);
      
      const rawLogs = await logsRes.json();
      const deviceLogs = Array.isArray(rawLogs) ? rawLogs.filter((l: any) => l.DeviceKey === device.DeviceKey) : [];
      
      if (deviceLogs.length > 0) {
        // Sort logs by time ascending to process them in order
        const sortedLogs = [...deviceLogs].sort((a, b) => new Date(a.IOTime).getTime() - new Date(b.IOTime).getTime());
        const lastSyncedTime = lastSyncedTimes.current[device.DeviceKey];
        
        // Filter for truly new logs to notify
        const newLogs = lastSyncedTime 
          ? sortedLogs.filter(l => new Date(l.IOTime).getTime() > new Date(lastSyncedTime).getTime())
          : sortedLogs;

        const sbData = deviceLogs.map((l: any) => ({
          device_key: l.DeviceKey,
          device_name: l.DeviceName,
          user_id: l.UserId,
          user_name: l.UserName,
          emp_code: l.EmpCode,
          io_time: l.IOTime,
          io_mode: l.IOMode,
          verify_mode: l.VerifyMode,
          work_code: l.WorkCode,
          image_path: l.ImagePath
        }));

        await sbUpsert("biomax_attendance_logs", sbData, "device_key,user_id,io_time");
        
        // Update last synced time
        if (sortedLogs.length > 0) {
          lastSyncedTimes.current[device.DeviceKey] = sortedLogs[sortedLogs.length - 1].IOTime;
        }

        // Only notify for truly new records
        if (isAuto && newLogs.length > 0) {
          const latestLog = newLogs[newLogs.length - 1];
          showNotification(
            `New Attendance (${newLogs.length})`, 
            `${latestLog.UserName} punched at ${latestLog.IOTime} on ${device.Name}`
          );
        }

        if (!isAuto || newLogs.length > 0) {
          addLog(`${prefix}Synced ${deviceLogs.length} records for ${device.Name}${newLogs.length > 0 ? ` (${newLogs.length} new)` : ''}`, "success");
          fetchRecentLogs();
          fetchStats();
        }
      }
    } catch (err: any) {
      addLog(`${prefix}Sync failed for ${device.Name}: ${err.message}`, "error");
    } finally {
      if (!isAuto) setIsSyncing(false);
    }
  };

  const startSync = async () => {
    if (!selectedDevice || !token) return;
    performSync(selectedDevice, dateRange.from, dateRange.to);
  };


  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#141415] border border-white/5 rounded-3xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Configuration Required</h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Please set your <code className="text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in the environment variables to continue.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Check Again
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Biomax Sync</h1>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Enterprise Attendance Bridge</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isSbConnected === null ? (
              <div className="hidden md:flex items-center gap-2 bg-white/5 text-zinc-500 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Supabase: Checking
              </div>
            ) : isSbConnected ? (
              <div className="hidden md:flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-emerald-500/20">
                <Cloud className="w-3 h-3" />
                Supabase: Online
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2 bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-red-500/20">
                <CloudOff className="w-3 h-3" />
                Supabase: Offline
              </div>
            )}
            {isRealtimeEnabled && (
              <div className="hidden md:flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-indigo-500/20">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Real-time Active
              </div>
            )}
            {!token ? (
              <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 px-4 py-2 rounded-xl text-xs font-bold border border-amber-500/20">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Connecting...
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-500/20">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                API Connected
              </div>
            )}
            <button className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-12 gap-8">
          
          {/* Left Column: Stats & Devices */}
          <div className="col-span-12 lg:col-span-4 space-y-8">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#141415] border border-white/5 rounded-3xl p-6">
                <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">Total Records</div>
                <div className="text-3xl font-bold text-white">{stats.total}</div>
              </div>
              <div className="bg-[#141415] border border-white/5 rounded-3xl p-6">
                <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-2">Active Devices</div>
                <div className="text-3xl font-bold text-white">{savedDevices.length}</div>
              </div>
            </div>

            {/* Device List */}
            <div className="bg-[#141415] border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    Saved Devices
                  </h2>
                  <button 
                    onClick={() => token && fetchSavedDevices()}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 text-zinc-500 ${isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Add Device Form */}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Enter Device Key..."
                    value={newDeviceKey}
                    onChange={(e) => setNewDeviceKey(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500/50 transition-colors"
                  />
                  <button 
                    onClick={saveDeviceByKey}
                    disabled={isAddingDevice || !newDeviceKey || !token}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 p-2.5 rounded-xl transition-all"
                  >
                    {isAddingDevice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                {savedDevices.length === 0 ? (
                  <div className="p-10 text-center text-zinc-500 text-sm italic">
                    {token ? "No devices saved. Add one above." : "Connect API to see devices"}
                  </div>
                ) : (
                  savedDevices.map((dev) => (
                    <div 
                      key={dev.device_key || dev.DeviceKey}
                      className={`w-full p-5 text-left transition-all hover:bg-white/[0.02] flex items-center justify-between group ${selectedDevice?.DeviceKey === (dev.device_key || dev.DeviceKey) ? 'bg-indigo-500/5 border-l-2 border-indigo-500' : ''}`}
                    >
                      <button 
                        onClick={() => setSelectedDevice({
                          ...dev,
                          DeviceKey: dev.device_key || dev.DeviceKey,
                          Name: dev.name || dev.Name,
                          IpAddress: dev.ip_address || dev.IpAddress
                        } as any)}
                        className="flex-1 text-left"
                      >
                        <div className="font-bold text-sm mb-1 group-hover:text-indigo-400 transition-colors">{dev.name || dev.Name}</div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                          <span>{dev.ip_address || dev.IpAddress}</span>
                          <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                          <span>{dev.device_key || dev.DeviceKey}</span>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => removeDevice(dev.device_key || dev.DeviceKey)}
                          className="p-2 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className={`w-4 h-4 transition-transform ${selectedDevice?.DeviceKey === (dev.device_key || dev.DeviceKey) ? 'text-indigo-400 translate-x-1' : 'text-zinc-700'}`} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Sync Control & Logs */}
          <div className="col-span-12 lg:col-span-8 space-y-8">
            
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl w-fit">
              <button 
                onClick={() => setActiveTab("sync")}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "sync" ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white"}`}
              >
                Sync Engine
              </button>
              <button 
                onClick={() => setActiveTab("history")}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "history" ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white"}`}
              >
                Attendance History
              </button>
            </div>

            {activeTab === "sync" ? (
              <>
                {/* Sync Control */}
                <div className="bg-[#141415] border border-white/5 rounded-3xl p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                      <h2 className="text-xl font-bold mb-1">Sync Control</h2>
                      <p className="text-sm text-zinc-500">Configure and trigger manual synchronization</p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Real-time Always On
                      </div>
                      <button 
                        onClick={requestNotificationPermission}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 text-zinc-400 hover:bg-white/10 transition-all border border-white/5"
                      >
                        Enable Alerts
                      </button>
                      <div className="w-px h-4 bg-white/10" />
                      <div className="px-4 py-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-zinc-500" />
                        <input 
                          type="date" 
                          value={dateRange.from}
                          onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                          className="bg-transparent text-sm font-bold outline-none text-white"
                        />
                      </div>
                      <div className="w-px h-4 bg-white/10" />
                      <div className="px-4 py-2">
                        <input 
                          type="date" 
                          value={dateRange.to}
                          onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                          className="bg-transparent text-sm font-bold outline-none text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button 
                      disabled={!selectedDevice || isSyncing}
                      onClick={startSync}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3"
                    >
                      {isSyncing ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Database className="w-5 h-5" />
                      )}
                      {isSyncing ? "Syncing Records..." : "Trigger Manual Sync"}
                    </button>
                    
                    <button 
                      disabled={!selectedDevice || isSyncingUsers}
                      onClick={syncUsers}
                      className="px-6 py-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 disabled:opacity-50 transition-colors flex items-center gap-2 font-bold text-sm"
                    >
                      {isSyncingUsers ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5 text-zinc-400" />}
                      Sync Users
                    </button>
                  </div>

                  {!selectedDevice && (
                    <div className="mt-4 flex items-center gap-2 text-amber-500 text-xs font-bold bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                      <AlertCircle className="w-4 h-4" />
                      Please select a device from the list to start syncing
                    </div>
                  )}
                </div>

                {/* Logs Console */}
                <div className="bg-[#141415] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[500px]">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <h2 className="font-bold flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-zinc-500" />
                      Sync Console
                    </h2>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        Live Output
                      </div>
                      <button 
                        onClick={() => setSyncLogs([])}
                        className="text-[10px] font-bold text-zinc-600 hover:text-zinc-400"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-3 font-mono text-[13px]">
                    <AnimatePresence initial={false}>
                      {syncLogs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-zinc-700 italic">
                          No activity recorded
                        </div>
                      ) : (
                        syncLogs.map((log) => (
                          <motion.div 
                            key={log.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-4 group"
                          >
                            <span className="text-zinc-700 shrink-0 select-none">[{log.time}]</span>
                            <div className="flex items-start gap-2">
                              {log.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                              {log.type === "error" && <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                              {log.type === "warning" && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                              {log.type === "info" && <Clock className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />}
                              <span className={`
                                ${log.type === "success" ? "text-emerald-400" : ""}
                                ${log.type === "error" ? "text-red-400" : ""}
                                ${log.type === "warning" ? "text-amber-400" : ""}
                                ${log.type === "info" ? "text-zinc-300" : ""}
                              `}>
                                {log.message}
                              </span>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                    <div ref={logEndRef} />
                  </div>
                </div>
              </>
            ) : (
              /* History Table */
              <div className="bg-[#141415] border border-white/5 rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h2 className="font-bold">Recent Attendance Records</h2>
                  <button 
                    onClick={fetchRecentLogs}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black/20 text-zinc-500 font-bold uppercase text-[10px] tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Time</th>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Emp Code</th>
                        <th className="px-6 py-4">Device</th>
                        <th className="px-6 py-4">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {recentLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-zinc-500 italic">
                            No records found in database
                          </td>
                        </tr>
                      ) : (
                        recentLogs.map((log, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-4 font-mono text-zinc-400">
                              {new Date(log.io_time).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 font-bold text-white">
                              {log.user_name}
                            </td>
                            <td className="px-6 py-4 text-zinc-500">
                              {log.emp_code}
                            </td>
                            <td className="px-6 py-4 text-zinc-500">
                              {log.device_name}
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase">
                                {log.verify_mode || "Verified"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6 text-xs font-bold text-zinc-600 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            Supabase Connected
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full" />
            Biomax Proxy Active
          </div>
        </div>
        <div className="text-xs text-zinc-700 font-medium">
          &copy; 2024 Attendance Bridge v2.4.0
        </div>
      </footer>
    </div>
  );
}
