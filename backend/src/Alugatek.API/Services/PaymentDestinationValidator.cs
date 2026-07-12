using System.Text;

namespace Alugatek.API.Services;

public static class PaymentDestinationValidator
{
    public static bool TryNormalize(string? raw, out string normalized)
    {
        normalized = string.Empty;

        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var trimmed = raw.Trim();
        var upper = trimmed.ToUpperInvariant();
        var hint = string.Empty;

        if (upper.StartsWith("IBAN"))
        {
            hint = "iban";
            trimmed = trimmed[4..].Trim();
        }
        else if (upper.StartsWith("MBWAY"))
        {
            hint = "mbway";
            trimmed = trimmed[6..].Trim();
        }
        else if (upper.StartsWith("MB WAY"))
        {
            hint = "mbway";
            trimmed = trimmed[6..].Trim();
        }

        var iban = trimmed.Replace(" ", string.Empty).ToUpperInvariant();
        if ((hint is "" or "iban") && IsValidIban(iban))
        {
            normalized = $"IBAN {GroupBy4(iban)}";
            return true;
        }

        var mbway = trimmed.Replace(" ", string.Empty).Replace("-", string.Empty);
        if ((hint is "" or "mbway") && IsValidMbway(mbway))
        {
            var normalizedMbway = mbway.StartsWith("+351", StringComparison.Ordinal)
                ? mbway
                : $"+351{mbway}";
            normalized = $"MB WAY {normalizedMbway}";
            return true;
        }

        return false;
    }

    private static bool IsValidMbway(string value)
    {
        if (value.Length == 9 && value[0] == '9')
            return value.All(char.IsDigit);

        if (value.Length == 13 && value.StartsWith("+351", StringComparison.Ordinal) && value[4] == '9')
            return value[1..].All(char.IsDigit);

        return false;
    }

    private static bool IsValidIban(string iban)
    {
        if (iban.Length < 15 || iban.Length > 34)
            return false;

        if (!char.IsLetter(iban[0]) || !char.IsLetter(iban[1]) || !char.IsDigit(iban[2]) || !char.IsDigit(iban[3]))
            return false;

        if (iban.StartsWith("PT", StringComparison.Ordinal) && iban.Length != 25)
            return false;

        if (!iban.All(char.IsLetterOrDigit))
            return false;

        var rearranged = string.Concat(iban[4..], iban[..4]);
        var numeric = new StringBuilder(rearranged.Length * 2);
        foreach (var ch in rearranged)
        {
            if (char.IsLetter(ch))
                numeric.Append(ch - 'A' + 10);
            else
                numeric.Append(ch);
        }

        return Mod97(numeric.ToString()) == 1;
    }

    private static int Mod97(string numeric)
    {
        var remainder = 0;
        foreach (var ch in numeric)
            remainder = (remainder * 10 + (ch - '0')) % 97;

        return remainder;
    }

    private static string GroupBy4(string value)
    {
        var sb = new StringBuilder(value.Length + value.Length / 4);
        for (var i = 0; i < value.Length; i++)
        {
            if (i > 0 && i % 4 == 0)
                sb.Append(' ');
            sb.Append(value[i]);
        }

        return sb.ToString();
    }
}