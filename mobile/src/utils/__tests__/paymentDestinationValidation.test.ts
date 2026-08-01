import {parsePaymentDestination} from '../paymentDestinationValidation';

describe('parsePaymentDestination', () => {
  describe('IBAN', () => {
    it.each([
      'PT50000201231234567890154',
      'pt50 0002 0123 1234 5678 9015 4',
      '  PT50 0002 0123 1234 5678 9015 4  ',
      'IBAN PT50000201231234567890154',
      'iban PT50 0002 0123 1234 5678 9015 4',
    ])('accepts and normalizes %s', raw => {
      expect(parsePaymentDestination(raw)).toEqual({
        kind: 'iban',
        description: 'IBAN PT50 0002 0123 1234 5678 9015 4',
      });
    });

    it('accepts a non-Portuguese IBAN', () => {
      expect(parsePaymentDestination('DE89370400440532013000')).toEqual({
        kind: 'iban',
        description: 'IBAN DE89 3704 0044 0532 0130 00',
      });
    });

    it('rejects an IBAN with a broken checksum', () => {
      expect(parsePaymentDestination('PT50000201231234567890155')).toBeNull();
    });

    it('rejects a Portuguese IBAN with the wrong length', () => {
      expect(parsePaymentDestination('PT5000020123123456789015')).toBeNull();
    });

    it('is idempotent over its own output', () => {
      const first = parsePaymentDestination('PT50000201231234567890154');
      expect(parsePaymentDestination(first!.description)).toEqual(first);
    });
  });

  describe('MB WAY', () => {
    it.each([
      '912345678',
      '912 345 678',
      '912-345-678',
      '+351912345678',
      'MBWAY 912345678',
      'MB WAY +351912345678',
    ])('accepts and normalizes %s', raw => {
      expect(parsePaymentDestination(raw)).toEqual({
        kind: 'mbway',
        description: 'MB WAY +351912345678',
      });
    });

    it.each(['812345678', '91234567', '9123456789', '+3518123456789'])(
      'rejects %s',
      raw => {
        expect(parsePaymentDestination(raw)).toBeNull();
      },
    );
  });

  describe('prefix hints', () => {
    it('does not accept a phone number behind the IBAN prefix', () => {
      expect(parsePaymentDestination('IBAN 912345678')).toBeNull();
    });

    it('does not accept an IBAN behind the MB WAY prefix', () => {
      expect(
        parsePaymentDestination('MBWAY PT50000201231234567890154'),
      ).toBeNull();
    });
  });

  it.each(['', '   ', 'not a payout destination'])('rejects %p', raw => {
    expect(parsePaymentDestination(raw)).toBeNull();
  });
});
