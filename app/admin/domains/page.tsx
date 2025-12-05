import { redis } from '@/lib/redis';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deleteDomainFormAction, verifyDomainFormAction } from '@/app/actions';
import { Globe, Check, X, Trash2 } from 'lucide-react';

export default async function DomainsPage() {
  // Get all custom domains
  const keys = await redis.keys('domain:*');
  const domains = await Promise.all(
    keys.map(async (key) => {
      const data = await redis.get(key);
      const domain = key.replace('domain:', '');
      return {
        domain,
        ...(data as any)
      };
    })
  );

  // Sort by creation date
  domains.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Custom Domains</h1>
            <p className="text-gray-600 mt-2">
              Manage your custom domain connections
            </p>
          </div>
        </div>

        {domains.length === 0 ? (
          <Card className="p-8 text-center">
            <Globe className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No domains yet
            </h3>
            <p className="text-gray-600">
              Add a custom domain from your profile menu
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {domains.map((domain) => (
              <Card key={domain.domain} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Globe className="h-5 w-5 text-gray-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {domain.domain}
                      </h3>
                      {domain.verified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <Check className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <X className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mb-3">
                      Added on{' '}
                      {new Date(domain.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>

                    {!domain.verified && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-md text-sm">
                        <p className="font-medium text-blue-900 mb-2">
                          DNS Configuration Required:
                        </p>
                        <div className="space-y-1 text-blue-800">
                          <p>
                            <strong>Option 1:</strong> Add an A record pointing
                            to your server IP
                          </p>
                          <p>
                            <strong>Option 2:</strong> Add a CNAME record
                            pointing to your main domain
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {!domain.verified && (
                      <form action={verifyDomainFormAction}>
                        <input type="hidden" name="domain" value={domain.domain} />
                        <Button type="submit" variant="outline" size="sm">
                          Verify DNS
                        </Button>
                      </form>
                    )}
                    <form action={deleteDomainFormAction}>
                      <input type="hidden" name="domain" value={domain.domain} />
                      <Button
                        type="submit"
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
