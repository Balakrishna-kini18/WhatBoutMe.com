import { extractProgramCoverImage } from '../src/modules/auth/auth.service';

describe('extractProgramCoverImage', () => {
  it('extracts Cloudinary URL from Admin plaintext description format', () => {
    const desc = `Level: Beginner
Duration: 6 Weeks
Image: https://res.cloudinary.com/ze1jhwgz/image/upload/v1793852424/mbxhratproksfnnu98hz.png
Audience: Engineers`;
    expect(extractProgramCoverImage(desc)).toBe(
      'https://res.cloudinary.com/ze1jhwgz/image/upload/v1793852424/mbxhratproksfnnu98hz.png'
    );
  });

  it('extracts URL from JSON formatted description with image or coverImage property', () => {
    const json1 = JSON.stringify({ image: 'https://res.cloudinary.com/demo/sample.jpg' });
    const json2 = JSON.stringify({ coverImage: 'https://res.cloudinary.com/demo/cover.jpg' });

    expect(extractProgramCoverImage(json1)).toBe('https://res.cloudinary.com/demo/sample.jpg');
    expect(extractProgramCoverImage(json2)).toBe('https://res.cloudinary.com/demo/cover.jpg');
  });

  it('returns null when description is undefined, null, or empty', () => {
    expect(extractProgramCoverImage(undefined)).toBeNull();
    expect(extractProgramCoverImage(null)).toBeNull();
    expect(extractProgramCoverImage('')).toBeNull();
    expect(extractProgramCoverImage('   ')).toBeNull();
  });

  it('returns null when description does not contain an Image field', () => {
    const plainDesc = 'This is a description without an image line.';
    expect(extractProgramCoverImage(plainDesc)).toBeNull();
  });
});
