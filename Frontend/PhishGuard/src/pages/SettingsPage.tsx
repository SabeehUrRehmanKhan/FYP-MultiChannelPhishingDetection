import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SectionHeader, GlassCard } from '../components/ui/UIComponents';
import { supabase } from '../lib/supabase';
import { User, Lock, Palette, Check, AlertCircle, Save, Upload } from 'lucide-react';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

export function SettingsPage() {
  const { profile, session, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [phone, setPhone] = useState(profile?.phone || '');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      if (!avatarFile) {
        setAvatarUrl(profile.avatar_url || '');
      }
      setPhone(profile.phone || '');
    }
  }, [profile, avatarFile]);

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      let finalAvatarUrl = avatarUrl;
      
      if (avatarFile && session?.user.id) {
        const fileExt = avatarFile.name.split('.').pop();
        const filePath = `${session.user.id}/avatar.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true });
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
          
        finalAvatarUrl = publicUrl + '?t=' + new Date().getTime(); // cache busting
      }

      const { error } = await supabase
        .from('profiles')
        .update({ 
          display_name: displayName, 
          avatar_url: finalAvatarUrl, 
          phone: phone,
          updated_at: new Date().toISOString() 
        })
        .eq('id', session?.user.id);

      if (error) throw error;
      await refreshProfile();
      setAvatarFile(null); // reset file state
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const initiatePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setMessage({ type: 'error', text: 'Please enter a password.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match!' });
      return;
    }
    setShowPasswordModal(true);
  };

  const executeUpdatePassword = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in px-6 py-10 md:px-12 md:py-16 max-w-6xl mx-auto flex flex-col gap-12">
      <div style={{ marginBottom: '16px' }}>
        <SectionHeader 
          title="Account Settings" 
          subtitle="Manage your identity, security credentials, and interface preferences." 
        />
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 border shadow-sm ${
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-500 border-green-500/20' 
            : 'bg-red-500/10 text-red-500 border-red-500/20'
        } animate-slide-in`}>
          {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px' }}>
        {/* Profile Card */}
        <div style={{ flex: '2 1 500px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
          <GlassCard className="relative group overflow-visible" style={{ padding: '40px' }}>
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none overflow-hidden h-full w-full flex justify-end items-start">
              <User size={160} style={{ marginRight: '-40px', marginTop: '-40px' }} />
            </div>
            
            <h3 className="text-xl font-headline font-semibold mb-8 flex items-center gap-3">
              <div className="p-2 bg-electric-blue/10 rounded-lg text-electric-blue">
                <User size={20} />
              </div>
              Profile Information
            </h3>
            
            <form onSubmit={handleUpdateProfile} className="flex flex-col gap-10">
              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '40px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label className="label-caps text-on-surface-variant flex items-center gap-2">
                    Display Name
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="input-field w-full pl-0"
                      placeholder="E.g. John Doe"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label className="label-caps text-on-surface-variant flex items-center gap-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <input 
                      type="tel" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="input-field w-full pl-0"
                      placeholder="+1 234 567 890"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label className="label-caps text-on-surface-variant block">Profile Picture</label>
                <div className="flex gap-6 items-center bg-surface-container/20 p-5 rounded-2xl border border-outline-variant/20 shadow-sm">
                  <div className="h-24 w-24 bg-surface-container rounded-2xl overflow-hidden flex-shrink-0 border-2 border-outline-variant shadow-2xl ring-4 ring-black/10 flex items-center justify-center">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt="Avatar Preview" 
                        className="h-full w-full object-cover" 
                        onError={(e) => (e.target as any).src = ''} 
                      />
                    ) : (
                      <User size={32} className="text-outline" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-3">
                    <input 
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setAvatarFile(file);
                          setAvatarUrl(URL.createObjectURL(file));
                        }
                      }}
                    />
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-ghost w-fit border border-outline-variant/40 hover:bg-surface-container flex items-center gap-2 text-sm py-2 px-4 rounded-lg cursor-pointer"
                    >
                      <Upload size={16} />
                      Choose Image...
                    </button>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-[0.1em] font-bold opacity-70">
                      MAX SIZE: 2MB. RECOMMENDED: SQUARE (1:1)
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-start' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary px-10 py-4 shadow-lg shadow-electric-blue/20 flex items-center gap-2 group-hover:scale-[1.02] transition-transform"
                  disabled={loading}
                >
                  <Save size={18} />
                  {loading ? 'Processing...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </GlassCard>

          <GlassCard className="relative group border-red-500/10 overflow-visible" style={{ padding: '40px' }}>
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none overflow-hidden h-full w-full flex justify-end items-start">
              <Lock size={160} style={{ marginRight: '-40px', marginTop: '-40px' }} />
            </div>

            <h3 className="text-xl font-headline font-semibold mb-8 flex items-center gap-3">
              <div className="p-2 bg-neon-red/10 rounded-lg text-neon-red">
                <Lock size={20} />
              </div>
              Security & Privacy
            </h3>

            <form onSubmit={initiatePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '40px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label className="label-caps text-on-surface-variant block">New Password</label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field w-full"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label className="label-caps text-on-surface-variant block">Confirm Password</label>
                  <input 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field w-full"
                    placeholder="Repeat new password"
                  />
                </div>
              </div>
              <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-start' }}>
                <button 
                  type="submit" 
                  className="btn btn-danger px-10 py-3 flex items-center gap-2 group-hover:scale-[1.02] transition-transform"
                  disabled={loading}
                >
                  <Lock size={18} />
                  Update Login Password
                </button>
              </div>
            </form>
          </GlassCard>
        </div>

        {/* Preferences Side */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
          <GlassCard className="relative group overflow-visible" style={{ padding: '40px' }}>
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none overflow-hidden h-full w-full flex justify-end items-start">
              <Palette size={140} style={{ marginRight: '-30px', marginTop: '-30px' }} />
            </div>

            <h3 className="text-xl font-headline font-semibold mb-8 flex items-center gap-3">
              <div className="p-2 bg-amber/10 rounded-lg text-amber">
                <Palette size={20} />
              </div>
              Appearance
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <label className="label-caps text-on-surface-variant block">System Theme</label>
                <div className="grid grid-cols-2" style={{ gap: '20px' }}>
                  <button 
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center gap-3 p-6 border rounded-2xl transition-all duration-300 cursor-pointer ${
                      theme === 'dark' 
                        ? 'bg-primary/10 border-primary text-primary shadow-xl shadow-primary/10' 
                        : 'bg-surface-container-low border-outline-variant/30 hover:border-outline text-on-surface-variant'
                    }`}
                  >
                    <span className="text-3xl">🌙</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Dark</span>
                  </button>
                  <button 
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center gap-3 p-6 border rounded-2xl transition-all duration-300 cursor-pointer ${
                      theme === 'light' 
                        ? 'bg-primary/10 border-primary text-primary shadow-xl shadow-primary/10' 
                        : 'bg-surface-container-low border-outline-variant/30 hover:border-outline text-on-surface-variant'
                    }`}
                  >
                    <span className="text-3xl">☀️</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Light</span>
                  </button>
                </div>
              </div>
              
              <div className="p-5 bg-surface-container-lowest/50 border border-outline-variant/20 rounded-2xl text-[11px] text-on-surface-variant leading-relaxed backdrop-blur-sm">
                <div className="flex gap-3">
                  <span className="text-electric-blue">◈</span>
                  <p>PhishGuard interface is optimized for <strong>High-Contrast Dark Mode</strong> to reduce visual fatigue during intensive analysis.</p>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="border-amber/10 group overflow-visible" style={{ padding: '40px' }}>
            <h3 className="text-lg font-headline font-semibold mb-6 text-amber flex items-center gap-3">
              <div className="p-2 bg-amber/10 rounded-lg">
                <AlertCircle size={18} />
              </div>
              Node Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="flex justify-between items-center text-xs">
                <span className="text-on-surface-variant uppercase tracking-widest font-bold">Access Level</span>
                <span 
                  className="bg-primary/10 text-primary rounded-full font-black uppercase tracking-widest border border-primary/20 whitespace-nowrap"
                  style={{ padding: '6px 14px', fontSize: '10px' }}
                >
                  {profile?.role}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-on-surface-variant uppercase tracking-widest font-bold">Node ID</span>
                <span className="font-mono opacity-40 bg-surface p-1 rounded tracking-tighter">
                  {profile?.id.substring(0, 12)}...
                </span>
              </div>
              <div className="pt-6 border-t border-outline-variant/30 mt-4">
                <p className="text-[10px] text-on-surface-variant/70 italic leading-relaxed">
                  Encryption Layer: AES-256-GCM <br/>
                  Session Context: Active-Verified
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onConfirm={executeUpdatePassword}
        title="Confirm Password Change"
        message="Are you sure you want to change your login password? You will need to use the new password on your next login."
        confirmText="Update Password"
        danger={true}
      />
    </div>
  );
}
