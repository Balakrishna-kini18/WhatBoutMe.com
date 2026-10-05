import Reveal from "./Reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { SiteContent } from "@/lib/siteContent";

export default function Faq({ faqs }: { faqs: SiteContent["faqs"] }) {
  return (
    <section id="faq" className="py-10 sm:py-16 md:py-24">
      <Reveal className="mx-auto max-w-[720px] px-5 md:px-10">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
          Questions
        </h2>

        <Accordion type="single" collapsible className="mt-4 sm:mt-8">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-line">
              <AccordionTrigger className="py-4 text-base font-medium hover:no-underline sm:py-5 md:text-lg [&>svg]:translate-y-1 [&>svg]:text-ink-soft">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-base leading-relaxed text-ink-soft">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}
