namespace Alugatek.API.Services;

public class StripeOptions
{
    public string? SecretKey { get; set; }
    public string? PublishableKey { get; set; }

    /// <summary>
    /// Stripe webhook signing secret (whsec_...). Used to verify that webhook
    /// requests come from Stripe. Get it from the Stripe Dashboard → Webhooks.
    /// </summary>
    public string? WebhookSecret { get; set; }
}
