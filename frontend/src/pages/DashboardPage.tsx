import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../useAuth'

/* Dashboard links follow the same routes and role rules as App.tsx and AdminLayout.tsx */

const cardClassName =
  'group rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition hover:border-brand-300 hover:shadow-lg'

function DashCard({
  to,
  title,
  description,
  cta,
  children,
}: {
  to: string
  title: string
  description: string
  cta: string
  children?: ReactNode
}) {
  return (
    <Link to={to} className={cardClassName}>
      <div className="text-sm font-semibold text-brand-700">{title}</div>
      <p className="mt-2 text-slate-600 group-hover:text-slate-800">{description}</p>
      {children}
      <span className="mt-4 inline-block text-sm font-semibold text-brand-700">{cta}</span>
    </Link>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

export function DashboardPage() {
  const { user, pendingCardRequests, paymentAmountEUR } = useAuth()
  const name = user?.name?.trim() || 'daar'
  const staff = Boolean(user?.is_admin || user?.is_operator)
  const adminOnly = Boolean(user?.is_admin)
  const operatorOnly = Boolean(user?.is_operator && !user?.is_admin)

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/40">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Hallo, {name}</h1>
        <p className="mt-2 text-lg text-slate-600">Welkom bij je lunchkraam-overzicht.</p>
        <p className="mt-2 text-sm text-slate-500">
          Hieronder vind je snelknoppen naar alle onderdelen van de site.
        </p>
      </div>

      <Section title="Lunchkraam">
        <DashCard
          to="/cards"
          title="Mijn kaarten"
          description="Bekijk je kaarten en gebruik een knipje voor een tosti."
          cta="Ga naar kaarten →"
        />
        <DashCard
          to="/buy"
          title="Kaart kopen"
          description={`Koop een nieuwe lunchkraam kaart online (€${paymentAmountEUR}).`}
          cta="Kaart kopen →"
        >
          <p className="mt-3 text-sm text-slate-500">
            {pendingCardRequests > 0 ? (
              <>
                Je hebt <strong className="text-slate-800">{pendingCardRequests}</strong> openstaande{' '}
                {pendingCardRequests === 1 ? 'aanvraag' : 'aanvragen'} (betaling nog te controleren; je
                kaart kun je al gebruiken).
              </>
            ) : (
              'Geen openstaande aanvragen.'
            )}
          </p>
        </DashCard>
        <DashCard
          to="/tosti"
          title="Tosti bestellen"
          description="Zet een tosti in de wachtrij voor de lunchkraam."
          cta="Tosti bestellen →"
        />
      </Section>

      {staff ? (
        <Section title="Kraam">
          <DashCard
            to="/kraam"
            title="Kraam"
            description="Wachtrijen, betalingen, fysieke verkoop en avondeten."
            cta="Open kraam →"
          />
        </Section>
      ) : null}

      {staff ? (
        <Section title={operatorOnly ? 'Beheer' : 'Admin'}>
          {adminOnly ? (
            <DashCard
              to="/admin"
              title="Overzicht"
              description="Dashboard met cijfers en grafieken."
              cta="Open overzicht →"
            />
          ) : null}
          <DashCard
            to="/admin/requests"
            title="Betalingswachtrij"
            description="Accordeer of weiger openstaande betalingen."
            cta="Open wachtrij →"
          />
          {adminOnly ? (
            <DashCard
              to="/admin/accounts"
              title="Accounts"
              description="Lokale accounts en rollen beheren."
              cta="Open accounts →"
            />
          ) : null}
          <DashCard
            to="/admin/expenses-overview"
            title="Overzichten"
            description="Financieel overzicht en statistieken."
            cta="Open overzichten →"
          />
          <DashCard
            to="/admin/expenses"
            title="Boodschappen"
            description="Bonnetjes en uitgaven registreren."
            cta="Open boodschappen →"
          />
          {adminOnly ? (
            <DashCard
              to="/admin/settings"
              title="Instellingen"
              description="Prijzen, Tikkie en overige instellingen."
              cta="Open instellingen →"
            />
          ) : null}
        </Section>
      ) : null}

      {user?.auth_kind === 'local' ? (
        <Section title="Account">
          <DashCard
            to="/account/password"
            title="Wachtwoord wijzigen"
            description="Stel een nieuw wachtwoord in voor je lokale account."
            cta="Wachtwoord wijzigen →"
          />
        </Section>
      ) : null}
    </div>
  )
}
