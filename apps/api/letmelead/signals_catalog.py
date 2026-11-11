"""The signal catalog: every signal the engine can watch for, in one place.

Each entry is a real-world buying moment. `status` is an honest capability label:

* ``live``        — found automatically on every lead search.
* ``partly_live`` — found automatically in some cases (the how-it-works text says which).
* ``by_hand``     — not automatic yet; researched by hand when you order leads on it.

`adapters` lists the source adapters that look for it. Only signals backed by at
least one adapter can be toggled on or off; `by_hand` signals cannot be enabled
because there is nothing automatic behind the switch yet.
"""

from __future__ import annotations

from dataclasses import dataclass, field

LIVE = "live"
PARTLY = "partly_live"
BY_HAND = "by_hand"

STATUS_LABEL = {LIVE: "Live", PARTLY: "Partly live", BY_HAND: "By hand"}

LINKEDIN = "linkedin"
EMAIL = "email"
X = "x"

# Adapters that are on for every new tenant; catalog signals backed only by these
# (or also by them) start switched on.
DEFAULT_ADAPTERS = ("news", "job_board", "reddit")


@dataclass(frozen=True)
class SignalDef:
    id: str
    category: str
    label: str
    description: str
    why_now: str
    how_it_works: str
    status: str
    channels: tuple[str, ...] = (LINKEDIN,)
    adapters: tuple[str, ...] = ()

    @property
    def automatic(self) -> bool:
        return self.status != BY_HAND and bool(self.adapters)

    @property
    def enabled_by_default(self) -> bool:
        return self.automatic and any(kind in DEFAULT_ADAPTERS for kind in self.adapters)


@dataclass(frozen=True)
class CategoryDef:
    id: str
    label: str
    signals: tuple[SignalDef, ...] = field(default_factory=tuple)


CATEGORIES: tuple[CategoryDef, ...] = (
    CategoryDef(
        id="asking",
        label="Asking now",
        signals=(
            SignalDef(
                id="describing_problem",
                category="asking",
                label="Describing the problem you solve",
                description="People writing in their own words about the pain your product fixes, without naming a solution yet.",
                why_now="They are aware of the problem. You arrive as the answer, not a cold pitch.",
                how_it_works="We search recent public posts where people describe this problem; an AI check keeps only real needs, not sellers.",
                status=PARTLY,
                channels=(LINKEDIN, X),
                adapters=("reddit", "news", "x"),
            ),
            SignalDef(
                id="asking_for_what_you_sell",
                category="asking",
                label="Asking for what you sell",
                description="Posts where someone asks for a tool or provider like you.",
                why_now="They asked. The message answers their question instead of interrupting them.",
                how_it_works="We search recent posts and keep the ones that ask for a tool or provider like you; an AI check filters out seller self-promotion.",
                status=PARTLY,
                channels=(LINKEDIN, X),
                adapters=("reddit", "x"),
            ),
            SignalDef(
                id="commenting_on_your_topic",
                category="asking",
                label="Commenting on your topic",
                description="People leaving real comments on recent posts about the problem you solve.",
                why_now="They are thinking about the topic right now, in public.",
                how_it_works="We read public discussion threads about your topic and keep people showing real interest, not drive-by one-word replies.",
                status=PARTLY,
                channels=(LINKEDIN,),
                adapters=("reddit", "x"),
            ),
            SignalDef(
                id="looking_for_alternative",
                category="asking",
                label="Looking for an alternative",
                description="Posts asking for an alternative to a tool or provider in your category.",
                why_now="They have decided to switch. The only question is to what.",
                how_it_works="Caught by our problem-post search when the post names the problem; posts that only name a tool can be missed.",
                status=PARTLY,
                channels=(LINKEDIN, X),
                adapters=("reddit", "x"),
            ),
            SignalDef(
                id="complaining_about_competitor",
                category="asking",
                label="Complaining about a competitor",
                description="Posts and comments where people are unhappy with a competitor you name.",
                why_now="Frustration with the current provider is the most common reason to switch.",
                how_it_works="Caught when the complaint names a tool or vendor in a problem post; we do not track every mention of every competitor yet.",
                status=PARTLY,
                channels=(LINKEDIN, X),
                adapters=("reddit", "x", "reviews"),
            ),
            SignalDef(
                id="engaging_with_competitor",
                category="asking",
                label="Engaging with a competitor",
                description="People commenting on or reacting to posts by competitors you name in Settings.",
                why_now="They follow the category already, so they need no education.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="asking_for_guide_on_topic",
                category="asking",
                label="Asking for a guide on your topic",
                description="People commenting on posts that give away a guide or template about what you sell.",
                why_now="They want to get better at exactly the job your product makes easier.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="reviewing_competitor_badly",
                category="asking",
                label="Reviewing a competitor badly",
                description="Recent low-star reviews of a competitor on public review sites.",
                why_now="A fresh bad review means fresh frustration, often before the renewal decision.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
        ),
    ),
    CategoryDef(
        id="hiring",
        label="Hiring",
        signals=(
            SignalDef(
                id="hiring_for_the_job_you_replace",
                category="hiring",
                label="Hiring for the job you replace",
                description="Job posts for a role or skill your product covers.",
                why_now="They are about to spend money on exactly this problem, one way or another.",
                how_it_works="Caught on the company's own careers page when the role title matches your ICP keywords.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_salespeople",
                category="hiring",
                label="Hiring salespeople",
                description="New job ads for sales roles: account executives, sales managers, business development.",
                why_now="New sellers need pipeline on day one, and they buy tools that create it.",
                how_it_works="Caught on the company's own careers page; public job ads are matched for sales and marketing roles only.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_first_salesperson",
                category="hiring",
                label="Hiring their first salesperson",
                description="Small companies posting their first sales role, often founder-led until now.",
                why_now="They are professionalising selling for the first time and need help doing it.",
                how_it_works="Caught when the company has sales openings and no other sales roles in history; the newest postings make this visible.",
                status=PARTLY,
                channels=(LINKEDIN,),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_marketers",
                category="hiring",
                label="Hiring marketers",
                description="New job ads for marketing roles: performance, content, social, demand generation.",
                why_now="New marketers need reach, content and pipeline support from week one.",
                how_it_works="Caught on the company's own careers page; public job ads are matched for sales and marketing roles only.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="building_outbound_team",
                category="hiring",
                label="Building an outbound team",
                description="Job ads for SDR, BDR or lead generation roles.",
                why_now="An outbound team needs lists, data and reasons to reach out. That is you.",
                how_it_works="Caught on the company's own careers page when the posting names an outbound or SDR role.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_customer_success",
                category="hiring",
                label="Hiring customer success",
                description="Job ads for customer success, account management or support roles.",
                why_now="Customer-facing teams grow when accounts are expanding — a good moment to be helpful, not salesy.",
                how_it_works="Caught on the company's own careers page when the posting names a success or account role.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_many_roles",
                category="hiring",
                label="Hiring for many roles at once",
                description="Companies with five or more new job ads in the last month.",
                why_now="Fast hiring means growth, budget and tooling gaps everywhere at once.",
                how_it_works="Caught when a careers page shows many open roles in one visit; ads posted off-cycle can be missed between scans.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_developers",
                category="hiring",
                label="Hiring developers",
                description="Job ads for software, data or IT roles.",
                why_now="More engineers means more tools, more infrastructure and a stretched team.",
                how_it_works="Caught on the company's own careers page; public job ads are matched for sales and marketing roles only, so developer ads surface when the careers page is scanned directly.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board",),
            ),
            SignalDef(
                id="hiring_finance_ops",
                category="hiring",
                label="Hiring finance or operations staff",
                description="Job ads for accounting, controlling, payroll or operations roles.",
                why_now="Back-office hires often follow a change in systems, volume or structure.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
            SignalDef(
                id="role_open_for_weeks",
                category="hiring",
                label="A role open for weeks",
                description="Job ads still online after 30 days or more.",
                why_now="A role they cannot fill is a problem they are actively paying for.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="posting_freelance_projects",
                category="hiring",
                label="Posting freelance projects",
                description="Companies posting freelance or project work in your field.",
                why_now="They buy the outcome as a project before they buy it as a product.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
        ),
    ),
    CategoryDef(
        id="leaders",
        label="New leaders",
        signals=(
            SignalDef(
                id="new_in_the_role",
                category="leaders",
                label="New in the role",
                description="A new head of the team you sell to, started in the last 90 days.",
                why_now="New leaders review the stack and the vendors behind it in their first months.",
                how_it_works="We scan recent news about every company we watch for a new leader; leaders who arrive quietly without coverage are missed.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="new_managing_director",
                category="leaders",
                label="New managing director",
                description="A new CEO, managing director or owner of a company you sell to.",
                why_now="A new top decision-maker rethinks everything their predecessor signed up for.",
                how_it_works="We scan recent news for leadership changes; filings in company registers are only visible when the news reports them.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="new_head_of_sales",
                category="leaders",
                label="New head of sales",
                description="A new head of sales, sales director or revenue leader.",
                why_now="New revenue leaders rebuild the pipeline and the tools that feed it.",
                how_it_works="We scan recent news about every company we watch for a new leader.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="new_head_of_marketing",
                category="leaders",
                label="New head of marketing",
                description="A new CMO, head of marketing or brand leader.",
                why_now="New marketing leaders review agencies, data and tooling in month one.",
                how_it_works="We scan recent news about every company we watch for a new leader.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="new_cto_head_of_it",
                category="leaders",
                label="New CTO or head of IT",
                description="A new CTO, CIO or head of IT.",
                why_now="New technical leaders review the stack and the vendors behind it.",
                how_it_works="We scan recent news about every company we watch for a new leader.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="owner_handing_over",
                category="leaders",
                label="Owner handing over the business",
                description="Family businesses where a new generation or buyer is taking over.",
                why_now="A handover brings fresh decisions, fresh budgets and outside help.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
        ),
    ),
    CategoryDef(
        id="growing",
        label="Growing",
        signals=(
            SignalDef(
                id="just_raised_money",
                category="growing",
                label="Just raised money",
                description="Funding announcements in your market and size range.",
                why_now="New budget and pressure to grow. Best when your product helps them spend it well.",
                how_it_works="We scan recent news for funding, acquisitions, new locations and expansion.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="just_bought_or_was_bought",
                category="growing",
                label="Just bought or was bought",
                description="Acquisitions and mergers involving companies you sell to.",
                why_now="Mergers mean overlapping tools, consolidated spend and new owners with new plans.",
                how_it_works="We scan recent news for funding, acquisitions, new locations and expansion.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="new_office_location",
                category="growing",
                label="Opening a new office or location",
                description="News of a new office, branch, plant or store.",
                why_now="New locations need everything from software to suppliers on day one.",
                how_it_works="We scan recent news for funding, acquisitions, new locations and expansion.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="entering_your_region",
                category="growing",
                label="Entering your region",
                description="Foreign companies announcing a move into your market.",
                why_now="New entrants need local entities, contracts, payroll and vendor help fast.",
                how_it_works="Caught when the expansion is reported in the news sources we scan; quieter entries are missed.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="launching_new_product",
                category="growing",
                label="Launching a new product",
                description="Announcements of a new product, platform or app.",
                why_now="A launch means a team with new goals, new budget and probably new gaps.",
                how_it_works="Caught when the launch makes the news or the company's own feed; small launches are missed.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news", "x"),
            ),
            SignalDef(
                id="growing_headcount_fast",
                category="growing",
                label="Growing headcount fast",
                description="Companies whose team grew a lot in the last six months.",
                why_now="Rapid growth breaks manual processes and tools first.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
            SignalDef(
                id="rebranding_renaming",
                category="growing",
                label="Rebranding or renaming",
                description="Companies announcing a new name, brand or positioning.",
                why_now="A rebrand signals strategy change — new leadership, new markets or new offers.",
                how_it_works="Caught when the change is reported in the news sources we scan.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="fastest_growing_list",
                category="growing",
                label="On a fastest-growing list",
                description="Companies named on growth rankings and award lists.",
                why_now="Public recognition comes with hiring, spend and pressure to keep the streak.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
        ),
    ),
    CategoryDef(
        id="website",
        label="Website and tools",
        signals=(
            SignalDef(
                id="outdated_website",
                category="website",
                label="Outdated website",
                description="Company websites with old copyright years, no mobile layout or old technology.",
                why_now="An ageing site usually means nobody owns the web stack — and everything around it is ageing too.",
                how_it_works="Caught when a scan visits the site and its technology markers are visibly out of date; judgement calls stay conservative.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("job_board", "news"),
            ),
            SignalDef(
                id="relaunched_website",
                category="website",
                label="Just relaunched their website or shop",
                description="News of a new website, online shop or platform.",
                why_now="A relaunch means active investment in how the company sells right now.",
                how_it_works="We scan recent news for relaunch, rebrand and platform announcements.",
                status=LIVE,
                channels=(LINKEDIN, EMAIL),
                adapters=("news",),
            ),
            SignalDef(
                id="moving_shop_system",
                category="website",
                label="Moving to a new shop system",
                description="Online shops switching to a new e-commerce platform.",
                why_now="A migration touches every process around the shop — payments, data, marketing.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
            SignalDef(
                id="adopting_new_crm",
                category="website",
                label="Adopting a new CRM or sales tool",
                description="Companies that recently started using a new CRM or sales tool.",
                why_now="New CRM means new data to fill and new process to support.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
            SignalDef(
                id="using_competitor_tool",
                category="website",
                label="Using a competitor's tool",
                description="Companies whose website shows they use a competitor's product.",
                why_now="You know exactly what they have — and what it does not do.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="started_running_ads",
                category="website",
                label="Started running ads",
                description="Companies that recently started or stopped paid ads.",
                why_now="Ad spend means acquisition pressure and a budget already committed to growth.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="website_missing_legal_basics",
                category="website",
                label="Website missing legal basics",
                description="Business websites with no legal notice, privacy policy or cookie consent.",
                why_now="Missing legal pages expose the company to warnings and fines — services that fix this sell well.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
        ),
    ),
    CategoryDef(
        id="events",
        label="Events",
        signals=(
            SignalDef(
                id="exhibiting_trade_fair",
                category="events",
                label="Exhibiting at a trade fair",
                description="Companies on the exhibitor list of an upcoming trade fair in your industry.",
                why_now="Exhibitors spend on visibility and meetings before the doors open.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, EMAIL),
            ),
            SignalDef(
                id="speaking_at_event",
                category="events",
                label="Speaking at an industry event",
                description="People speaking at conferences and meetups on your topic.",
                why_now="Speakers are visible, credible and easy to open with a relevant remark.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="posting_going_to_event",
                category="events",
                label="Posting that they're going to an event",
                description="People posting that they will attend a trade fair or conference you also attend.",
                why_now="A shared event is the least cold way to start a conversation.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN, X),
            ),
        ),
    ),
    CategoryDef(
        id="local",
        label="Local businesses",
        signals=(
            SignalDef(
                id="local_fresh_reason",
                category="local",
                label="Local businesses with a fresh reason",
                description="New openings, new locations, bad recent reviews or a new website in the towns you pick.",
                why_now="Something just changed locally, and local changes are visible to local sellers first.",
                how_it_works="We search map listings and page updates for the places you watch; everything else in this category stays by hand.",
                status=PARTLY,
                channels=(LINKEDIN, EMAIL),
                adapters=("google_maps", "facebook"),
            ),
            SignalDef(
                id="newly_registered",
                category="local",
                label="Newly registered businesses",
                description="Companies registered in the last few weeks in your area or industry.",
                why_now="New businesses buy almost everything for the first time.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(EMAIL,),
            ),
            SignalDef(
                id="recent_bad_reviews",
                category="local",
                label="Recent bad reviews",
                description="Businesses with new one- or two-star reviews on map listings.",
                why_now="A bad review is an open wound; reputation help is an easy yes.",
                how_it_works="Caught when your review feed includes competitor ratings; we read the feed you configure rather than scraping every platform.",
                status=PARTLY,
                channels=(EMAIL,),
                adapters=("reviews", "google_maps"),
            ),
            SignalDef(
                id="few_online_reviews",
                category="local",
                label="Few or no online reviews",
                description="Local businesses with very few reviews compared with competitors nearby.",
                why_now="They are invisible next to competitors, and they often do not know it yet.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(EMAIL,),
            ),
            SignalDef(
                id="local_hiring",
                category="local",
                label="Local businesses hiring",
                description="Shops, practices and trades posting job ads in your area.",
                why_now="Hiring locally means growing locally — and needing help to keep up.",
                how_it_works="Caught when the careers page of a watched local business is scanned.",
                status=PARTLY,
                channels=(EMAIL,),
                adapters=("job_board",),
            ),
        ),
    ),
    CategoryDef(
        id="knows_you",
        label="Already knows you",
        signals=(
            SignalDef(
                id="engages_with_your_posts",
                category="knows_you",
                label="People who engage with your posts",
                description="People who like or comment on your LinkedIn or X posts and match your buyer.",
                why_now="They already know you. A reply costs nothing and lands warm.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="buyers_in_network",
                category="knows_you",
                label="Buyers already in your network",
                description="Your own connections and their connections who match your buyer.",
                why_now="Warm paths convert many times better than cold ones.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
            SignalDef(
                id="past_customers_changed_jobs",
                category="knows_you",
                label="Past customers who changed jobs",
                description="People who used your product at one company and just started at another.",
                why_now="They arrive with trust earned at their old company and budget at the new one.",
                how_it_works="Written for you. Not automatic yet; we research it by hand when you order leads on it.",
                status=BY_HAND,
                channels=(LINKEDIN,),
            ),
        ),
    ),
)

CATALOG: dict[str, SignalDef] = {signal.id: signal for category in CATEGORIES for signal in category.signals}
SIGNAL_COUNT = len(CATALOG)


def category_list() -> list[dict]:
    """Serialise the whole catalog for the API and the tests."""
    return [
        {
            "id": category.id,
            "label": category.label,
            "signals": [
                {
                    "id": signal.id,
                    "label": signal.label,
                    "description": signal.description,
                    "why_now": signal.why_now,
                    "how_it_works": signal.how_it_works,
                    "status": signal.status,
                    "channels": list(signal.channels),
                    "adapters": list(signal.adapters),
                    "automatic": signal.automatic,
                }
                for signal in category.signals
            ],
        }
        for category in CATEGORIES
    ]
