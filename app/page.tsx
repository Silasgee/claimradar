import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <Badge variant="secondary">Milestone 0 — Foundation</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">ClaimRadar</h1>
        <p className="text-muted-foreground max-w-md text-lg">
          Discover forgotten Web3 assets by scanning any public wallet address.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Project status</CardTitle>
          <CardDescription>
            The platform foundation is in place. Wallet scanning arrives in Milestone 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">Service health</p>
          <Button asChild variant="outline" size="sm">
            <a href="/api/health">/api/health</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
