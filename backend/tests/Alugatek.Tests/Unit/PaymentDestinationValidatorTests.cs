using Alugatek.API.Services;

namespace Alugatek.Tests.Unit;

public class PaymentDestinationValidatorTests
{
    [Theory]
    [InlineData("PT50000201231234567890154")]
    [InlineData("pt50 0002 0123 1234 5678 9015 4")]
    [InlineData("  PT50 0002 0123 1234 5678 9015 4  ")]
    [InlineData("IBAN PT50000201231234567890154")]
    [InlineData("iban PT50 0002 0123 1234 5678 9015 4")]
    public void TryNormalize_AcceptsValidPortugueseIban(string raw)
    {
        var accepted = PaymentDestinationValidator.TryNormalize(raw, out var normalized);

        Assert.True(accepted);
        Assert.Equal("IBAN PT50 0002 0123 1234 5678 9015 4", normalized);
    }

    [Fact]
    public void TryNormalize_AcceptsNonPortugueseIban()
    {
        var accepted = PaymentDestinationValidator.TryNormalize("DE89370400440532013000", out var normalized);

        Assert.True(accepted);
        Assert.Equal("IBAN DE89 3704 0044 0532 0130 00", normalized);
    }

    [Theory]
    [InlineData("912345678")]
    [InlineData("912 345 678")]
    [InlineData("912-345-678")]
    [InlineData("+351912345678")]
    [InlineData("MBWAY 912345678")]
    [InlineData("MB WAY +351912345678")]
    public void TryNormalize_AcceptsValidMbwayNumbers(string raw)
    {
        var accepted = PaymentDestinationValidator.TryNormalize(raw, out var normalized);

        Assert.True(accepted);
        Assert.Equal("MB WAY +351912345678", normalized);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not a payout destination")]
    [InlineData("PT50000201231234567890155")]      // bad checksum
    [InlineData("PT5000020123123456789015")]       // wrong PT length
    [InlineData("812345678")]                      // does not start with 9
    [InlineData("91234567")]                       // too short
    [InlineData("9123456789")]                     // too long
    [InlineData("+3518123456789")]                 // wrong mobile prefix
    public void TryNormalize_RejectsInvalidDestinations(string? raw)
    {
        var accepted = PaymentDestinationValidator.TryNormalize(raw, out var normalized);

        Assert.False(accepted);
        Assert.Equal(string.Empty, normalized);
    }

    [Fact]
    public void TryNormalize_RejectsMbwayNumberWhenIbanPrefixIsUsed()
    {
        var accepted = PaymentDestinationValidator.TryNormalize("IBAN 912345678", out _);

        Assert.False(accepted);
    }

    [Fact]
    public void TryNormalize_RejectsIbanWhenMbwayPrefixIsUsed()
    {
        var accepted = PaymentDestinationValidator.TryNormalize("MBWAY PT50000201231234567890154", out _);

        Assert.False(accepted);
    }

    [Fact]
    public void TryNormalize_IsIdempotentForAlreadyNormalizedValues()
    {
        Assert.True(PaymentDestinationValidator.TryNormalize("PT50000201231234567890154", out var first));
        Assert.True(PaymentDestinationValidator.TryNormalize(first, out var second));

        Assert.Equal(first, second);
    }
}
