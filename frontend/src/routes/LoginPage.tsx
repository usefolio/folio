import { SignIn } from "@clerk/clerk-react";

const LoginPage: React.FC = () => {
  return (
    <div className="relative flex items-center justify-center h-screen w-screen bg-gray-100 overflow-hidden p-5">
      {/* Background bubbles */}

      {/* Clerk SignIn Component */}
      <SignIn
        routing="hash"
        signUpUrl="/signup"
        waitlistUrl="/waitlist"
        appearance={{
          layout: {
            // buttons at the bottom if any
            socialButtonsPlacement: "bottom",
          },
          variables: {
            borderRadius: "0px",
            // Primary theme will match the bubbles of blue
          },
          elements: {
            card: {
              width: "100%",
              border: "none",
              borderRadius: "0px",
              // Same background as in rootbox
            },
            formButtonPrimary:
              "bg-primary text-white text-primary-foreground hover:bg-primary/80",

            // Inputs currently unused, maybe used in the future
            // input: {
            //   borderRadius: "6px",
            //   backgroundColor: "#f0f2f5",
            //   border: "1px solid #d9d9d9",
            // },
            // Hide the "Development mode" footer
          },
        }}
      />
    </div>
  );
};

export default LoginPage;
