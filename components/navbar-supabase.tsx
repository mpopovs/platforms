'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { CustomDomainForm } from '@/app/custom-domain-form';
import { User, LogOut, Plus, Mail, Settings, Globe, Eye } from 'lucide-react';
import Link from 'next/link';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export function NavBarSupabase() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showDomainDialog, setShowDomainDialog] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isAuthMode, setIsAuthMode] = useState<'signin' | 'signup' | 'magiclink'>('signin');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Check if user has a password set
      // Users who signed in via magic link (OTP) don't have a password initially
      // We'll assume they don't have a password and let them set one
      if (session?.user) {
        // Check user metadata or app_metadata for password indicator
        // By default, assume magic link users don't have password
        // This will be updated to true after they set one
        const userHasPassword = session.user.app_metadata?.has_password || false;
        setHasPassword(userHasPassword);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const userHasPassword = session.user.app_metadata?.has_password || false;
        setHasPassword(userHasPassword);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleMagicLinkAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) throw error;
      setEmailSent(true);
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      if (isAuthMode === 'signup') {
        // Sign up with email and password
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
        if (error) throw error;
        setEmailSent(true);
      } else {
        // Sign in with email and password
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        setShowAuthDialog(false);
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setShowProfileMenu(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setSettingsError('Passwords do not match');
      setIsAuthLoading(false);
      return;
    }

    try {
      if (hasPassword && currentPassword) {
        // User has a password, need to verify current password first
        // Try to sign in with current password to verify it
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password: currentPassword
        });

        if (signInError) {
          setSettingsError('Current password is incorrect');
          setIsAuthLoading(false);
          return;
        }
      }

      // Update password - Supabase allows this for authenticated users
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setSettingsSuccess(
        hasPassword
          ? 'Password changed successfully!'
          : 'Password set successfully! You can now use it to sign in.'
      );
      setHasPassword(true);
      
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Close dialog after 2 seconds
      setTimeout(() => {
        setShowSettingsDialog(false);
        setSettingsSuccess(null);
      }, 2000);
    } catch (error: any) {
      setSettingsError(error.message || 'Failed to update password');
    } finally {
      setIsAuthLoading(false);
    }
  };

  return (
    <>
      {/* Custom Domain Dialog - Outside of dropdown */}
      <Dialog open={showDomainDialog} onOpenChange={setShowDomainDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Domain</DialogTitle>
            <DialogDescription>
              Connect your own domain to your account. You'll need to configure DNS settings after adding.
            </DialogDescription>
          </DialogHeader>
          <CustomDomainForm />
        </DialogContent>
      </Dialog>

      {/* Settings Dialog - Outside of dropdown */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Settings</DialogTitle>
            <DialogDescription>
              {hasPassword
                ? 'Change your password'
                : 'Set a password for faster sign-in'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePasswordChange} className="space-y-4 pt-4">
            {settingsError && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {settingsError}
              </div>
            )}
            
            {settingsSuccess && (
              <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
                {settingsSuccess}
              </div>
            )}

            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">
                {hasPassword ? 'New Password' : 'Password'}
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-xs text-gray-500">Minimum 6 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isAuthLoading}>
              {isAuthLoading
                ? 'Updating...'
                : hasPassword
                ? 'Change Password'
                : 'Set Password'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Claypixels
            </Link>

            <div className="flex items-center gap-4">
              {loading ? (
                <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
              ) : user ? (
                <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={user.email || 'User'}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-600" />
                    </div>
                  )}
                </button>

                {showProfileMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowProfileMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-900">
                          {user.user_metadata?.full_name || user.email}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {user.email}
                        </p>
                      </div>

                      {/* Custom Domain - temporarily disabled
                      <button
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => {
                          setShowDomainDialog(true);
                          setShowProfileMenu(false);
                        }}
                      >
                        <Globe className="h-4 w-4" />
                        Add Custom Domain
                      </button>
                      */}

                      <Link
                        href="/admin/viewers"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => setShowProfileMenu(false)}
                      >
                        <Eye className="h-4 w-4" />
                        My Viewers
                      </Link>

                      <Link
                        href="/admin"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setShowProfileMenu(false)}
                      >
                        Admin Dashboard
                      </Link>

                      <button
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => {
                          setShowSettingsDialog(true);
                          setShowProfileMenu(false);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </button>

                      <button
                        onClick={handleSignOut}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2 border-t border-gray-200"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
                <DialogTrigger asChild>
                  <Button>Sign In</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {isAuthMode === 'signin' ? 'Sign In' : isAuthMode === 'signup' ? 'Create Account' : 'Sign In with Magic Link'}
                    </DialogTitle>
                    <DialogDescription>
                      {emailSent
                        ? 'Check your email to continue'
                        : isAuthMode === 'signin'
                        ? 'Sign in to your account with email and password'
                        : isAuthMode === 'signup'
                        ? 'Create a new account with email and password'
                        : 'We\'ll send you a magic link to sign in'}
                    </DialogDescription>
                  </DialogHeader>
                  {emailSent ? (
                    <div className="py-6 text-center">
                      <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <Mail className="h-6 w-6 text-green-600" />
                      </div>
                      <p className="text-sm text-gray-600">
                        We sent an email to <strong>{email}</strong>
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        {isAuthMode === 'signup' 
                          ? 'Click the link in the email to confirm your account.'
                          : 'Click the link in the email to sign in.'}
                      </p>
                      <Button
                        onClick={() => {
                          setEmailSent(false);
                          setEmail('');
                          setPassword('');
                        }}
                        variant="outline"
                        className="mt-4"
                      >
                        Use a different email
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 pt-4">
                      {authError && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                          {authError}
                        </div>
                      )}

                      {isAuthMode === 'magiclink' ? (
                        <form onSubmit={handleMagicLinkAuth} className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={isAuthLoading}
                          >
                            {isAuthLoading ? 'Sending...' : 'Send Magic Link'}
                          </Button>
                        </form>
                      ) : (
                        <form onSubmit={handlePasswordAuth} className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                              id="password"
                              type="password"
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              minLength={6}
                            />
                            {isAuthMode === 'signup' && (
                              <p className="text-xs text-gray-500">
                                Minimum 6 characters
                              </p>
                            )}
                          </div>
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={isAuthLoading}
                          >
                            {isAuthLoading
                              ? 'Processing...'
                              : isAuthMode === 'signup'
                              ? 'Create Account'
                              : 'Sign In'}
                          </Button>
                        </form>
                      )}

                      <div className="space-y-2">
                        {isAuthMode !== 'magiclink' && (
                          <Button
                            onClick={() => setIsAuthMode('magiclink')}
                            variant="outline"
                            className="w-full"
                            type="button"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Use Magic Link Instead
                          </Button>
                        )}
                        
                        {isAuthMode === 'magiclink' && (
                          <Button
                            onClick={() => setIsAuthMode('signin')}
                            variant="outline"
                            className="w-full"
                            type="button"
                          >
                            Sign In with Password
                          </Button>
                        )}

                        {/* Sign up disabled for now
                        <div className="text-center text-sm">
                          {isAuthMode === 'signin' || isAuthMode === 'magiclink' ? (
                            <button
                              onClick={() => setIsAuthMode('signup')}
                              className="text-blue-600 hover:underline"
                              type="button"
                            >
                              Don't have an account? Sign up
                            </button>
                          ) : (
                            <button
                              onClick={() => setIsAuthMode('signin')}
                              className="text-blue-600 hover:underline"
                              type="button"
                            >
                              Already have an account? Sign in
                            </button>
                          )}
                        </div>
                        */}
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>
    </nav>
    </>
  );
}
