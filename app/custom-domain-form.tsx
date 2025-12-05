'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addCustomDomainAction } from '@/app/actions';
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type DomainState = {
  error?: string;
  success?: boolean;
  domain?: string;
};

export function CustomDomainForm() {
  const [state, action, isPending] = useActionState<DomainState, FormData>(
    addCustomDomainAction,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="domain">Custom Domain</Label>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-gray-400 hover:text-gray-600">
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">DNS Configuration Required</h4>
                <div className="space-y-2 text-xs text-gray-600">
                  <div>
                    <p className="font-medium text-gray-900">Option 1: A Record</p>
                    <p>Point your domain to the server IP address:</p>
                    <code className="block mt-1 p-2 bg-gray-100 rounded">
                      Type: A<br />
                      Name: @ (or your subdomain)<br />
                      Value: YOUR_SERVER_IP<br />
                      TTL: 3600
                    </code>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Option 2: CNAME Record</p>
                    <p>Point your domain to the main domain:</p>
                    <code className="block mt-1 p-2 bg-gray-100 rounded">
                      Type: CNAME<br />
                      Name: @ (or your subdomain)<br />
                      Value: claypixels.eu<br />
                      TTL: 3600
                    </code>
                  </div>
                  <p className="text-gray-500 italic mt-2">
                    Note: DNS changes can take up to 48 hours to propagate
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Input
          id="domain"
          name="domain"
          type="text"
          placeholder="example.com"
          defaultValue={state?.domain}
          required
        />
        <p className="text-xs text-gray-500">
          Enter your custom domain (e.g., example.com or subdomain.example.com)
        </p>
      </div>

      {state?.error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md space-y-2">
          <p className="font-medium">Domain added successfully!</p>
          <div className="text-xs space-y-1">
            <p className="font-medium">Configure DNS:</p>
            <p>Add an A record pointing to your server IP, or</p>
            <p>Add a CNAME record pointing to your main domain</p>
          </div>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Adding Domain...' : 'Add Custom Domain'}
      </Button>
    </form>
  );
}
